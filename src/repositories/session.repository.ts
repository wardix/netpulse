import db from '../db/database'
import type { Session } from '../models/types'

export class SessionRepository {
  async findByIp(ip: string): Promise<Session | null> {
    return (await db
      .query(
        `SELECT * FROM sessions WHERE ip_address = ?
         ORDER BY CASE WHEN status = 'online' THEN 0 ELSE 1 END, last_update DESC
         LIMIT 1`
      )
      .get(ip)) as Session | null
  }

  async findByIps(ips: string[]): Promise<Session[]> {
    if (ips.length === 0) return []

    const placeholders = ips.map(() => '?').join(',')
    return (await db
      .query(
        `SELECT * FROM sessions WHERE ip_address IN (${placeholders})
         ORDER BY CASE WHEN status = 'online' THEN 0 ELSE 1 END, last_update DESC`
      )
      .all(...ips)) as Session[]
  }

  async findDuplicateOnlineSessions(): Promise<Session[]> {
    return (await db
      .query(
        `SELECT * FROM sessions 
         WHERE status = 'online' 
           AND ip_address IN (
             SELECT ip_address 
             FROM sessions 
             WHERE status = 'online' AND ip_address IS NOT NULL 
             GROUP BY ip_address 
             HAVING count(*) > 1
           )`
      )
      .all()) as Session[]
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
       ON CONFLICT(username, router_id, ip_address) DO UPDATE SET 
         status = excluded.status,
         uptime = excluded.uptime,
         last_update = CURRENT_TIMESTAMP`,
      [router_id, username, ip, status, uptime || null]
    )

    // When a session goes online, delete stale offline rows with the same IP
    // from other router/username combinations to prevent duplicate IP conflicts
    if (status === 'online' && ip) {
      await db.run(
        `DELETE FROM sessions
         WHERE ip_address = ?
           AND status = 'offline'
           AND NOT (username = ? AND router_id = ?)`,
        [ip, username, router_id]
      )
    }
  }

  async setAllOfflineForRouter(router_id: string): Promise<void> {
    await db.run("UPDATE sessions SET status = 'offline' WHERE router_id = ?", [
      router_id,
    ])
  }

  async setOfflineIfNotIn(
    router_id: string,
    activeSessions: { name: string; address: string }[]
  ): Promise<string[]> {
    if (activeSessions.length === 0) {
      // All sessions for this router are offline
      const affected = await db
        .query(
          "SELECT username FROM sessions WHERE router_id = ? AND status = 'online'"
        )
        .all(router_id)
      await db.run(
        "UPDATE sessions SET status = 'offline', last_update = CURRENT_TIMESTAMP WHERE router_id = ? AND status = 'online'",
        [router_id]
      )
      return affected.map((r) => r.username as string)
    }

    // Use tuple (username, ip_address) NOT IN (...) to correctly handle
    // multiple sessions per user — only offline sessions whose specific
    // (username, ip) pair is no longer active
    const placeholders = activeSessions.map(() => '(?, ?)').join(',')
    const pairParams = activeSessions.flatMap((s) => [s.name, s.address])

    const affected = await db
      .query(
        `SELECT username, ip_address FROM sessions
         WHERE router_id = ? AND status = 'online'
           AND (username, ip_address) NOT IN (${placeholders})`
      )
      .all(router_id, ...pairParams)

    await db.run(
      `UPDATE sessions SET status = 'offline', last_update = CURRENT_TIMESTAMP
       WHERE router_id = ? AND status = 'online'
         AND (username, ip_address) NOT IN (${placeholders})`,
      [router_id, ...pairParams]
    )

    return affected.map((r) => `${r.username} (${r.ip_address})`)
  }
}
