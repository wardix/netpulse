import db from '../db/database'
import type { Session } from '../models/types'

export class SessionRepository {
  findByIp(ip: string): Session | null {
    return db
      .query('SELECT * FROM sessions WHERE ip_address = ?')
      .get(ip) as Session | null
  }

  findByIps(ips: string[]): Session[] {
    const placeholders = ips.map(() => '?').join(',')
    return db
      .query(`SELECT * FROM sessions WHERE ip_address IN (${placeholders})`)
      .all(...ips) as Session[]
  }

  findAllOnline(): Session[] {
    return db
      .query("SELECT * FROM sessions WHERE status = 'online'")
      .all() as Session[]
  }

  updateStatus(
    router_id: string,
    username: string,
    ip: string,
    status: 'online' | 'offline',
    uptime?: string
  ): void {
    db.run(
      `INSERT INTO sessions (router_id, username, ip_address, status, uptime, last_update) 
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(username, router_id) DO UPDATE SET 
         ip_address = excluded.ip_address,
         status = excluded.status,
         uptime = excluded.uptime,
         last_update = CURRENT_TIMESTAMP`,
      [router_id, username, ip, status, uptime || null]
    )
  }

  setAllOfflineForRouter(router_id: string): void {
    db.run("UPDATE sessions SET status = 'offline' WHERE router_id = ?", [
      router_id,
    ])
  }
}
