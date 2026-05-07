import db from '../db/database'
import type { Session } from '../models/types'

export class SessionRepository {
  async findByIp(ip: string): Promise<Session | null> {
    return (await db
      .query('SELECT * FROM sessions WHERE ip_address = ?')
      .get(ip)) as Session | null
  }

  async findByIps(ips: string[]): Promise<Session[]> {
    const placeholders = ips.map(() => '?').join(',')
    return (await db
      .query(`SELECT * FROM sessions WHERE ip_address IN (${placeholders})`)
      .all(...ips)) as Session[]
  }

  async findAllOnline(): Promise<Session[]> {
    return (await db
      .query("SELECT * FROM sessions WHERE status = 'online'")
      .all()) as Session[]
  }

  async updateStatus(
    router_id: string,
    username: string,
    ip: string,
    status: 'online' | 'offline',
    uptime?: string
  ): Promise<void> {
    await db.run(
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

  async setAllOfflineForRouter(router_id: string): Promise<void> {
    await db.run("UPDATE sessions SET status = 'offline' WHERE router_id = ?", [
      router_id,
    ])
  }
}
