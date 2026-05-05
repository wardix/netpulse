import { Database } from 'bun:sqlite'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'

const defaultPath = join(process.cwd(), 'data', 'monitor.db')
const dbPath = process.env.DB_PATH || defaultPath

// Ensure the directory for the database file exists
const dbDir = dirname(dbPath)
mkdirSync(dbDir, { recursive: true })

const db = new Database(dbPath, { create: true })

// Initialize tables with Raw SQL
db.run(`
  CREATE TABLE IF NOT EXISTS routers (
    id TEXT PRIMARY KEY,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 80,
    username TEXT NOT NULL,
    password TEXT NOT NULL
  )
`)

db.run(`
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

db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip_address)`)
db.run(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_user_router ON sessions(username, router_id)`
)

export default db
