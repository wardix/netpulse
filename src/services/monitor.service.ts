import type { RouterRepository } from '../repositories/router.repository'
import type { SessionRepository } from '../repositories/session.repository'
import type { MikrotikClient } from '../infrastructure/mikrotik.client'
import { nisClient } from '../infrastructure/nis.client'
import type { Router, RouterPublic, Session } from '../models/types'
import { logger } from '../utils/logger'

export class MonitorService {
  constructor(
    private sessionRepo: SessionRepository,
    private routerRepo: RouterRepository,
    private mikrotikClient: MikrotikClient
  ) {}

  async syncRouterById(routerId: string): Promise<void> {
    const routers = await this.routerRepo.findAll()
    const router = routers.find((r) => r.id === routerId)
    if (!router) {
      throw new Error(`Router with id ${routerId} not found`)
    }
    await this.syncRouter(router)
  }

  async syncRouter(router: Router): Promise<void> {
    logger.debug(`Fetching from router ${router.id}`, {
      routerId: router.id,
      baseUrl: router.base_url,
    })
    const activeSessions = await this.mikrotikClient.getActiveSessions(router)
    logger.info(`Received sessions from router`, {
      routerId: router.id,
      sessionCount: activeSessions.length,
    })

    // Verify newly online IPs against NIS Gateway
    const currentOnlineIps = new Set(await this.sessionRepo.findOnlineIpsForRouter(router.id))
    const newlyOnlineIps = activeSessions
      .filter(s => !currentOnlineIps.has(s.address))
      .map(s => s.address)
    
    let validNewlyOnlineIps = new Set<string>()
    if (newlyOnlineIps.length > 0) {
      try {
        logger.debug(`Verifying ${newlyOnlineIps.length} newly online IPs with NIS Gateway...`)
        validNewlyOnlineIps = await nisClient.verifyIps(newlyOnlineIps)
      } catch (err) {
        logger.warn('Failed to verify newly online IPs with NIS Gateway, skipping is_rogue check', { routerId: router.id })
      }
    }

    // 1. Upsert all currently active sessions to 'online'
    for (const s of activeSessions) {
      let is_rogue: boolean | undefined = undefined
      if (newlyOnlineIps.includes(s.address)) {
         is_rogue = !validNewlyOnlineIps.has(s.address)
      }

      logger.debug('Upserting session to online', {
        routerId: router.id,
        username: s.name,
        ip: s.address,
        uptime: s.uptime,
        is_rogue
      })
      await this.sessionRepo.updateStatus(
        router.id,
        s.name,
        s.address,
        'online',
        s.uptime,
        is_rogue
      )
    }

    // 2. Deduplicate on (username, ip_address) pairs — MikroTik may return
    // the same pair twice. True duplicates are unexpected; log a warning.
    const seen = new Set<string>()
    const duplicates: typeof activeSessions = []
    const uniqueSessions = activeSessions.filter((s) => {
      const key = `${s.name}||${s.address}`
      if (seen.has(key)) {
        duplicates.push(s)
        return false
      }
      seen.add(key)
      return true
    })
    if (duplicates.length > 0) {
      logger.warn('MikroTik returned duplicate (username, ip) pairs', {
        routerId: router.id,
        duplicates: duplicates.map((s) => ({ username: s.name, ip: s.address })),
      })
    }

    // 3. Mark as offline only sessions whose (username, ip) pair is no longer active
    logger.debug('Setting inactive sessions to offline', {
      routerId: router.id,
      activeSessionCount: uniqueSessions.length,
    })
    for (const s of uniqueSessions) {
      logger.debug('Session still active, will not be set offline', {
        routerId: router.id,
        username: s.name,
        ip: s.address,
      })
    }
    const offlinedSessions = await this.sessionRepo.setOfflineIfNotIn(
      router.id,
      uniqueSessions.map((s) => ({ name: s.name, address: s.address }))
    )
    for (const session of offlinedSessions) {
      logger.debug('Session set to offline', {
        routerId: router.id,
        session,
      })
    }

    logger.info(`Database updated for router`, { routerId: router.id })
  }

  async syncAllRouters(): Promise<void> {
    const routers = await this.routerRepo.findAll()
    logger.info('Sync started', { routerCount: routers.length, routerIds: routers.map((r) => r.id) })

    const results = await Promise.allSettled(
      routers.map((router) => this.syncRouter(router))
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

    let is_rogue: boolean | undefined = undefined
    if (status === 'online' && ip) {
      try {
        const validIps = await nisClient.verifyIps([ip])
        is_rogue = !validIps.has(ip)
      } catch (err) {
        logger.warn('Failed to verify IP during webhook, skipping is_rogue update', { ip })
      }
    }

    await this.sessionRepo.updateStatus(routerId, username, ip, status, undefined, is_rogue)
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

  async getDuplicateIpsMetrics(): Promise<string> {
    const duplicates = await this.sessionRepo.findDuplicateOnlineSessions()
    
    // Always provide HELP and TYPE headers
    let metrics = '# HELP netpulse_duplicate_ip Indicates a duplicate IP session\n'
    metrics += '# TYPE netpulse_duplicate_ip gauge\n'
    
    for (const session of duplicates) {
      metrics += `netpulse_duplicate_ip{ip="${session.ip_address}",router="${session.router_id}",username="${session.username}"} 1\n`
    }

    const rogues = await this.sessionRepo.findRogueOnlineSessions()
    metrics += '\n# HELP netpulse_rogue_session Session active on router but unregistered in NIS billing\n'
    metrics += '# TYPE netpulse_rogue_session gauge\n'
    for (const session of rogues) {
      metrics += `netpulse_rogue_session{ip="${session.ip_address}",router="${session.router_id}",username="${session.username}"} 1\n`
    }
    
    return metrics
  }

  async checkRogueSessions(): Promise<void> {
    try {
      const rogues = await this.sessionRepo.findRogueOnlineSessions()
      if (rogues.length === 0) return

      const ips = rogues.map(r => r.ip_address)
      logger.info(`Starting periodic check for ${ips.length} rogue sessions`)

      const validIps = await nisClient.verifyIps(ips)
      
      for (const session of rogues) {
        if (validIps.has(session.ip_address)) {
          logger.info(`Self-healing: Session for IP ${session.ip_address} is now registered in NIS`)
          await this.sessionRepo.updateStatus(session.router_id, session.username, session.ip_address, 'online', session.uptime, false)
        }
      }
    } catch (err) {
      logger.error('Failed to run periodic rogue session check', { error: err })
    }
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
