import type { MikrotikActiveSession, Router } from '../models/types'

export class MikrotikClient {
  async getActiveSessions(router: Router): Promise<MikrotikActiveSession[]> {
    const auth = btoa(`${router.username}:${router.password}`)
    const url = `http://${router.host}:${router.port}/rest/ppp/active?.proplist=name,address,uptime`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
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
