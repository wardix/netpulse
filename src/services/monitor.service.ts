import type { RouterRepository } from '../repositories/router.repository'
import type { SessionRepository } from '../repositories/session.repository'
import type { MikrotikClient } from '../infrastructure/mikrotik.client'
import type { Router, RouterPublic, Session } from '../models/types'

export class MonitorService {
  constructor(
    private sessionRepo: SessionRepository,
    private routerRepo: RouterRepository,
    private mikrotikClient: MikrotikClient
  ) {}

  async syncAllRouters(): Promise<void> {
    const routers = await this.routerRepo.findAll()
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

      // 1. Upsert all currently active sessions to 'online'
      for (const s of activeSessions) {
        await this.sessionRepo.updateStatus(
          router.id,
          s.name,
          s.address,
          'online',
          s.uptime
        )
      }

      // 2. Mark as offline only those who were online but are no longer active
      const activeUsernames = activeSessions.map((s) => s.name)
      await this.sessionRepo.setOfflineIfNotIn(router.id, activeUsernames)

      console.log(`[Sync] Database updated for router: ${router.id}.`)
    }
    console.log('[Sync] All routers synchronized successfully.')
  }

  async updateFromWebhook(
    routerId: string,
    username: string,
    ip: string,
    status: 'online' | 'offline'
  ): Promise<void> {
    console.log(
      `[Webhook] Received ${status} event for user: ${username} (IP: ${ip}) from router: ${routerId}`
    )
    await this.sessionRepo.updateStatus(routerId, username, ip, status)
  }

  async getStatusByIp(
    ip: string
  ): Promise<Session | { status: 'offline'; ip: string }> {
    const session = await this.sessionRepo.findByIp(ip)
    return session || { status: 'offline', ip: ip }
  }

  async getBulkStatus(
    ips: string[]
  ): Promise<(Session | { ip: string; status: 'offline' })[]> {
    const sessions = await this.sessionRepo.findByIps(ips)
    return ips.map((ip) => {
      const s = sessions.find((session) => session.ip_address === ip)
      return s || { ip, status: 'offline' }
    })
  }

  async getAllOnline(): Promise<Session[]> {
    return await this.sessionRepo.findAllOnline()
  }
}

export class RouterService {
  constructor(private routerRepo: RouterRepository) {}

  async addRouter(router: Router): Promise<void> {
    await this.routerRepo.save(router)
  }

  async listRouters(): Promise<RouterPublic[]> {
    const routers = await this.routerRepo.findAll()
    return routers.map(({ password: _pw, ...r }) => r)
  }

  async deleteRouter(id: string): Promise<void> {
    await this.routerRepo.delete(id)
  }
}
