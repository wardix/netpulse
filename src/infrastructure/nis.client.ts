import { env } from 'bun'
import { logger } from '../utils/logger'

export class NisClient {
  private apiUrl: string
  private apiToken: string

  constructor() {
    this.apiUrl = env.NIS_API_URL || ''
    this.apiToken = env.NIS_API_TOKEN || ''
  }

  /**
   * Verifies a list of IPs against the NIS Gateway.
   * Returns a set of IPs that are considered valid (registered).
   */
  async verifyIps(ips: string[]): Promise<Set<string>> {
    if (ips.length === 0) return new Set()
    if (!this.apiUrl || !this.apiToken) {
      logger.warn('NIS_API_URL or NIS_API_TOKEN is not configured. Skipping NIS verification.')
      return new Set(ips) // Assume all valid if not configured
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ips })
      })

      if (!response.ok) {
        logger.error(`NIS Gateway returned error: ${response.status} ${response.statusText}`)
        throw new Error(`NIS Gateway error: ${response.status}`)
      }

      const data = await response.json()
      const validIps = new Set<string>()

      if (data && Array.isArray(data.results)) {
        for (const result of data.results) {
          if (result && result.ip) {
            validIps.add(result.ip)
          }
        }
      }
      
      return validIps
    } catch (error) {
      logger.error('Failed to contact NIS Gateway', { error })
      throw error
    }
  }
}

export const nisClient = new NisClient()
