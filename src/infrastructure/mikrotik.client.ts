import type { MikrotikActiveSession, Router } from '../models/types'
import { logger } from '../utils/logger'

export class MikrotikClient {
  async getActiveSessions(router: Router): Promise<MikrotikActiveSession[]> {
    const auth = btoa(`${router.username}:${router.password}`)
    const base = router.base_url.replace(/\/$/, '')
    const url = `${base}/rest/ppp/active?.proplist=name,address,uptime`
    const timeoutMs = parseInt(process.env.MIKROTIK_TIMEOUT || '5000', 10)

    logger.debug('Sending request to MikroTik', {
      routerId: router.id,
      url,
      timeoutMs,
    })

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      })

      logger.debug('MikroTik response received', {
        routerId: router.id,
        httpStatus: response.status,
        httpStatusText: response.statusText,
        ok: response.ok,
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '(unreadable body)')
        logger.error('MikroTik API returned non-OK status', {
          routerId: router.id,
          httpStatus: response.status,
          httpStatusText: response.statusText,
          responseBody: body,
        })
        return []
      }

      const data = (await response.json()) as MikrotikActiveSession[]
      logger.debug('MikroTik response parsed', {
        routerId: router.id,
        sessionCount: data.length,
        sessions: data.map((s) => ({ name: s.name, address: s.address, uptime: s.uptime })),
      })
      return data
    } catch (error) {
      const isTimeout =
        error instanceof Error && error.name === 'TimeoutError'
      logger.error('Failed to fetch from MikroTik router', {
        routerId: router.id,
        url,
        isTimeout,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }
}
