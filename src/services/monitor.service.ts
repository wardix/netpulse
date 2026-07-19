import type { RouterRepository } from '../repositories/router.repository'
import type { SessionRepository } from '../repositories/session.repository'
import type { MikrotikClient } from '../infrastructure/mikrotik.client'
import type { Router, RouterPublic, Session } from '../models/types'
import { logger } from '../utils/logger'

export class MonitorService {
  constructor(
    private sessionRepo: SessionRepository,
    private routerRepo: RouterRepository,
    private mikrotikClient: MikrotikClient
  ) {}

  async syncAllRouters(): Promise<void> {
    const routers = await this.routerRepo.findAll()
    logger.info('Sync started', { routerCount: routers.length, routerIds: routers.map((r) => r.id) })

    const results = await Promise.allSettled(
      routers.map(async (router) => {
        logger.debug(`Fetching from router ${router.id}`, {
          routerId: router.id,
          baseUrl: router.base_url,
        })
        const activeSessions =
          await this.mikrotikClient.getActiveSessions(router)
        logger.info(`Received sessions from router`, {
          routerId: router.id,
          sessionCount: activeSessions.length,
        })

        // 1. Upsert all currently active sessions to 'online'
        for (const s of activeSessions) {
          logger.debug('Upserting session to online', {
            routerId: router.id,
            username: s.name,
            ip: s.address,
            uptime: s.uptime,
          })
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
        logger.debug('Setting inactive sessions to offline', {
          routerId: router.id,
          activeUsernameCount: activeUsernames.length,
        })
        for (const username of activeUsernames) {
          logger.debug('Session still active, will not be set offline', {
            routerId: router.id,
            username,
          })
        }
        await this.sessionRepo.setOfflineIfNotIn(router.id, activeUsernames)

        logger.info(`Database updated for router`, { routerId: router.id })
      })
    )

    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    )
    if (failed.length > 0) {
      logger.error('Sync failed for some routers', {
        count: failed.length,
        errors: failed.map((r) => r.reason?.message || r.reason),
      })
    }

    logger.info('Parallel sync completed')
  }

  async updateFromWebhook(
    routerId: string,
    username: string,
    ip: string,
    status: 'online' | 'offline'
  ): Promise<void> {
    logger.debug(`Received ${status} event`, {
      routerId,
      username,
      ip,
      status,
    })
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
