import { Database as SqliteDatabase } from 'bun:sqlite'
import { SQL } from 'bun'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

type Row = Record<string, unknown>

const DATABASE_URL = process.env.DATABASE_URL || process.env.DB_URL

let db: {
  query: (sql: string) => {
    all: (...params: any[]) => Promise<Row[]>
    get: (...params: any[]) => Promise<Row | null>
  }
  run: (sql: string, params?: any[]) => Promise<void>
}

if (DATABASE_URL) {
  const client = new SQL(DATABASE_URL)

  // Create tables in Postgres
  await client`
    CREATE TABLE IF NOT EXISTS routers (
      id TEXT PRIMARY KEY,
      base_url TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL
    )
  `

  await client`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      router_id TEXT NOT NULL,
      username TEXT NOT NULL,
      ip_address TEXT,
      status TEXT CHECK (status IN ('online', 'offline')) NOT NULL,
      last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      uptime TEXT,
      FOREIGN KEY (router_id) REFERENCES routers(id)
    )
  `

  await client`CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip_address)`
  // Migrate: drop old (username, router_id) index if it exists, replace with (username, router_id, ip_address)
  await client`DROP INDEX IF EXISTS idx_sessions_user_router`
  await client`CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_user_router_ip ON sessions(username, router_id, ip_address)`

  // bun:sql uses PostgreSQL-native $1, $2, ... placeholders.
  // All repository SQL uses ? (SQLite style), so we convert before executing.
  const convertPlaceholders = (sql: string): string => {
    let i = 0
    return sql.replace(/\?/g, () => `$${++i}`)
  }

  db = {
    query: (sql: string) => ({
      all: async (...params: unknown[]) => {
        const result = await client.unsafe(convertPlaceholders(sql), params)
        return (result ?? []) as Row[]
      },
      get: async (...params: unknown[]) => {
        const rows = await client.unsafe(convertPlaceholders(sql), params)
        return ((rows ?? [])[0] ?? null) as Row | null
      },
    }),
    run: async (sql: string, params: unknown[] = []) => {
      await client.unsafe(convertPlaceholders(sql), params)
    },
  }
} else {
  const defaultPath = join(process.cwd(), 'data', 'monitor.db')
  const dbPath = process.env.DB_PATH || defaultPath

  // Ensure the directory for the database file exists
  const dbDir = dirname(dbPath)
  mkdirSync(dbDir, { recursive: true })

  const sqliteDb = new SqliteDatabase(dbPath, { create: true })

  // Initialize tables with Raw SQL
  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS routers (
      id TEXT PRIMARY KEY,
      base_url TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL
    )
  `)

  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      router_id TEXT NOT NULL,
      username TEXT NOT NULL,
      ip_address TEXT,
      status TEXT CHECK(status IN ('online', 'offline')) NOT NULL,
      last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
      uptime TEXT,
      FOREIGN KEY (router_id) REFERENCES routers(id)
    )
  `)

  sqliteDb.run(
    `CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip_address)`
  )
  // Migrate: drop old (username, router_id) index if it exists, replace with (username, router_id, ip_address)
  sqliteDb.run(`DROP INDEX IF EXISTS idx_sessions_user_router`)
  sqliteDb.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_user_router_ip ON sessions(username, router_id, ip_address)`
  )

  db = {
    query: (sql: string) => {
      return {
        all: (...params: any[]) => {
          return Promise.resolve(sqliteDb.query(sql).all(...params))
        },
        get: (...params: any[]) => {
          return Promise.resolve(
            sqliteDb.query(sql).get(...params) as Row | null
          )
        },
      }
    },
    run: (sql: string, params: any[] = []) => {
      sqliteDb.run(sql, params)
      return Promise.resolve()
    },
  }
}

export default db
