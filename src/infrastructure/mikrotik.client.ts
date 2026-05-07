import type { MikrotikActiveSession, Router } from '../models/types'

export class MikrotikClient {
  async getActiveSessions(router: Router): Promise<MikrotikActiveSession[]> {
    const auth = btoa(`${router.username}:${router.password}`)
    const base = router.base_url.replace(/\/$/, '')
    const url = `${base}/rest/ppp/active?.proplist=name,address,uptime`

    const timeoutMs = parseInt(process.env.MIKROTIK_TIMEOUT || '5000', 10)

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        throw new Error(`Mikrotik API error: ${response.statusText}`)
      }

      return (await response.json()) as MikrotikActiveSession[]
    } catch (error) {
      console.error(`Failed to fetch from router ${router.id}:`, error)
      return []
    }
  }
}
