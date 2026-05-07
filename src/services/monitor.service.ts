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
    console.log(
      `[Sync] Starting synchronization for ${routers.length} routers...`
    )

    for (const router of routers) {
      console.log(
        `[Sync] Fetching active sessions from router: ${router.id} (${router.base_url})...`
      )
      const activeSessions = await this.mikrotikClient.getActiveSessions(router)
      console.log(
        `[Sync] Received ${activeSessions.length} active sessions from ${router.id}.`
      )

      // Mark all as offline for this router first, then update online ones
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
      console.log(`[Sync] Database updated for router: ${router.id}.`)
    }
    console.log('[Sync] All routers synchronized successfully.')
  }

  updateFromWebhook(
    routerId: string,
    username: string,
    ip: string,
    status: 'online' | 'offline'
  ): void {
    console.log(
      `[Webhook] Received ${status} event for user: ${username} (IP: ${ip}) from router: ${routerId}`
    )
    this.sessionRepo.updateStatus(routerId, username, ip, status)
  }

  getStatusByIp(ip: string): Session | { status: 'offline'; ip: string } {
    const session = this.sessionRepo.findByIp(ip)
    return session || { status: 'offline', ip: ip }
  }

  getBulkStatus(
    ips: string[]
  ): (Session | { ip: string; status: 'offline' })[] {
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
