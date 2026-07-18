import db from '../db/database'
import type { Router } from '../models/types'

export class RouterRepository {
  async findAll(): Promise<Router[]> {
    return (await db.query('SELECT * FROM routers').all()) as Router[]
  }

  async findById(id: string): Promise<Router | null> {
    return (await db
      .query('SELECT * FROM routers WHERE id = ?')
      .get(id)) as Router | null
  }

  async save(router: Router): Promise<void> {
    await db.run(
      'INSERT INTO routers (id, base_url, username, password) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET base_url = excluded.base_url, username = excluded.username, password = excluded.password',
      [router.id, router.base_url, router.username, router.password]
    )
  }

  async delete(id: string): Promise<void> {
    // Delete associated sessions first (FK constraint order)
    await db.run('DELETE FROM sessions WHERE router_id = ?', [id])
    // Then delete the router itself
    await db.run('DELETE FROM routers WHERE id = ?', [id])
  }
}
