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
  await client`CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_user_router ON sessions(username, router_id)`

  db = {
    query: (sql: string) => {
      return {
        all: async (...params: any[]) => {
          const parts = sql.split('?') as any
          parts.raw = parts
          const res = await (client as any)(parts, ...params)
          return (res ?? []) as Row[]
        },
        get: async (...params: any[]) => {
          const rows = await db.query(sql).all(...params)
          return rows[0] || null
        },
      }
    },
    run: async (sql: string, params: any[] = []) => {
      const parts = sql.split('?') as any
      parts.raw = parts
      await (client as any)(parts, ...params)
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
  sqliteDb.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_user_router ON sessions(username, router_id)`
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
