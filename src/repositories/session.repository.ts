import db from '../db/database'
import type { Session } from '../models/types'

function mapSession(s: any): Session {
  if (!s) return s
  let lastUpdate = s.last_update
  if (typeof lastUpdate === 'string') {
    // If it's a raw SQLite format without timezone (YYYY-MM-DD HH:MM:SS), format it to ISO with Z
    if (!lastUpdate.includes('T')) {
      lastUpdate = lastUpdate.replace(' ', 'T')
    }
    if (
      !lastUpdate.endsWith('Z') &&
      !lastUpdate.includes('+') &&
      !lastUpdate.includes('-')
    ) {
      lastUpdate += 'Z'
    }
  } else if (lastUpdate instanceof Date) {
    lastUpdate = lastUpdate.toISOString()
  }
  return { ...s, last_update: lastUpdate }
}

export class SessionRepository {
  async findByIp(ip: string): Promise<Session | null> {
    const row = await db
      .query(
        `SELECT * FROM sessions WHERE ip_address = ?
         ORDER BY CASE WHEN status = 'online' THEN 0 ELSE 1 END, last_update DESC
         LIMIT 1`
      )
      .get(ip)
    return row ? mapSession(row) : null
  }

  async findByIps(ips: string[]): Promise<Session[]> {
    if (ips.length === 0) return []

    const placeholders = ips.map(() => '?').join(',')
    const rows = await db
      .query(
        `SELECT * FROM sessions WHERE ip_address IN (${placeholders})
         ORDER BY CASE WHEN status = 'online' THEN 0 ELSE 1 END, last_update DESC`
      )
      .all(...ips)
    return (rows as any[]).map(mapSession)
  }

  async findDuplicateOnlineSessions(): Promise<Session[]> {
    const rows = await db
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
      .all()
    return (rows as any[]).map(mapSession)
  }

  async findRogueOnlineSessions(): Promise<Session[]> {
    const rows = await db
      .query(
        "SELECT * FROM sessions WHERE status = 'online' AND is_rogue = TRUE"
      )
      .all()
    return (rows as any[]).map(mapSession)
  }

  async findOnlineIpsForRouter(router_id: string): Promise<string[]> {
    const rows = await db
      .query(
        "SELECT ip_address FROM sessions WHERE router_id = ? AND status = 'online' AND ip_address IS NOT NULL"
      )
      .all(router_id)
    return rows.map((r: any) => r.ip_address as string)
  }

  async findAllOnline(): Promise<Session[]> {
    const rows = await db
      .query("SELECT * FROM sessions WHERE status = 'online'")
      .all()
    return (rows as any[]).map(mapSession)
  }

  async findAllOffline(): Promise<Session[]> {
    const rows = await db
      .query(
        "SELECT * FROM sessions WHERE status = 'offline' ORDER BY last_update DESC"
      )
      .all()
    return (rows as any[]).map(mapSession)
  }

  async updateStatus(
    router_id: string,
    username: string,
    ip: string,
    status: 'online' | 'offline',
    uptime?: string,
    is_rogue?: boolean
  ): Promise<void> {
    if (is_rogue !== undefined) {
      await db.run(
        `INSERT INTO sessions (router_id, username, ip_address, status, uptime, is_rogue, last_update) 
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(username, router_id, ip_address) DO UPDATE SET 
           status = excluded.status,
           uptime = excluded.uptime,
           is_rogue = excluded.is_rogue,
           last_update = CURRENT_TIMESTAMP`,
        [router_id, username, ip, status, uptime || null, is_rogue]
      )
    } else {
      await db.run(
        `INSERT INTO sessions (router_id, username, ip_address, status, uptime, last_update) 
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(username, router_id, ip_address) DO UPDATE SET 
           status = excluded.status,
           uptime = excluded.uptime,
           last_update = CURRENT_TIMESTAMP`,
        [router_id, username, ip, status, uptime || null]
      )
    }

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
          "SELECT username, ip_address FROM sessions WHERE router_id = ? AND status = 'online'"
        )
        .all(router_id)
      await db.run(
        "UPDATE sessions SET status = 'offline', last_update = CURRENT_TIMESTAMP WHERE router_id = ? AND status = 'online'",
        [router_id]
      )
      return (affected as any[]).map((r) => `${r.username} (${r.ip_address})`)
    }

    // Query all currently online sessions for this router from database
    const currentOnline = (await db
      .query(
        "SELECT id, username, ip_address FROM sessions WHERE router_id = ? AND status = 'online'"
      )
      .all(router_id)) as Array<{
      id: number
      username: string
      ip_address: string
    }>

    if (currentOnline.length === 0) {
      return []
    }

    // Use Set to compare in memory, avoiding huge NOT IN tuple lists that exceed SQL stack depth limits
    const activeSet = new Set(
      activeSessions.map((s) => `${s.name}||${s.address}`)
    )

    const toOffline = currentOnline.filter(
      (s) => !activeSet.has(`${s.username}||${s.ip_address}`)
    )

    if (toOffline.length === 0) {
      return []
    }

    // Update in chunks by primary key `id`
    const CHUNK_SIZE = 500
    for (let i = 0; i < toOffline.length; i += CHUNK_SIZE) {
      const chunk = toOffline.slice(i, i + CHUNK_SIZE)
      const placeholders = chunk.map(() => '?').join(',')
      const ids = chunk.map((s) => s.id)
      await db.run(
        `UPDATE sessions SET status = 'offline', last_update = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
        ids
      )
    }

    return toOffline.map((r) => `${r.username} (${r.ip_address})`)
  }
}
