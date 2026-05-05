import type { RouterRepository } from '../repositories/router.repository'
import type { SessionRepository } from '../repositories/session.repository'
import type { MikrotikClient } from '../infrastructure/mikrotik.client'
import type { Router, Session } from '../models/types'

export class MonitorService {
  constructor(
    private sessionRepo: SessionRepository,
    private routerRepo: RouterRepository,
    private mikrotikClient: MikrotikClient
  ) {}

  async syncAllRouters(): Promise<void> {
    const routers = this.routerRepo.findAll()

    for (const router of routers) {
      const activeSessions = await this.mikrotikClient.getActiveSessions(router)

      // Mark all as offline for this router first, then update online ones
      // Or more efficiently: update in a transaction
      this.sessionRepo.setAllOfflineForRouter(router.id)

      for (const s of activeSessions) {
        this.sessionRepo.updateStatus(
          router.id,
          s.name,
          s.address,
          'online',
          s.uptime
        )
      }
    }
  }

  updateFromWebhook(
    routerId: string,
    username: string,
    ip: string,
    status: 'online' | 'offline'
  ): void {
    this.sessionRepo.updateStatus(routerId, username, ip, status)
  }

  getStatusByIp(ip: string): Session | { status: 'offline'; ip: string } {
    const session = this.sessionRepo.findByIp(ip)
    return session || { status: 'offline', ip: ip }
  }

  getBulkStatus(ips: string[]): any[] {
    const sessions = this.sessionRepo.findByIps(ips)
    return ips.map((ip) => {
      const s = sessions.find((session) => session.ip_address === ip)
      return s || { ip, status: 'offline' }
    })
  }

  getAllOnline(): Session[] {
    return this.sessionRepo.findAllOnline()
  }
}

export class RouterService {
  constructor(private routerRepo: RouterRepository) {}

  addRouter(router: Router): void {
    this.routerRepo.save(router)
  }

  listRouters(): Router[] {
    return this.routerRepo.findAll()
  }

  deleteRouter(id: string): void {
    this.routerRepo.delete(id)
  }
}
