import db from '../db/database'
import type { Router } from '../models/types'

export class RouterRepository {
  findAll(): Router[] {
    return db.query('SELECT * FROM routers').all() as Router[]
  }

  findById(id: string): Router | null {
    return db
      .query('SELECT * FROM routers WHERE id = ?')
      .get(id) as Router | null
  }

  save(router: Router): void {
    db.run(
      'INSERT OR REPLACE INTO routers (id, base_url, username, password) VALUES (?, ?, ?, ?)',
      [router.id, router.base_url, router.username, router.password]
    )
  }

  delete(id: string): void {
    db.run('DELETE FROM routers WHERE id = ?', [id])
  }
}
