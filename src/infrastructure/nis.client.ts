import { env } from 'bun'
import { logger } from '../utils/logger'

export interface NisFttxSubscriber {
  subscriber_id: number
  subscriber_name: string
  ip_address: string
  operator_id: number
  circuit_id: string
  homepass_id: string
  subscription_status: string
}

export class NisClient {
  private ipSearchUrl: string
  private fttxByIpUrl: string
  private apiToken: string

  constructor() {
    this.ipSearchUrl = env.NIS_IP_SEARCH_URL || env.NIS_API_URL || ''
    this.fttxByIpUrl = env.NIS_FTTX_BY_IP_URL || ''
    this.apiToken = env.NIS_API_TOKEN || ''
  }

  /**
   * Fetches FTTX subscriber details for a specific IP from the NIS Gateway.
   * Returns NisFttxSubscriber if found, or null if 404 (unregistered / not found).
   */
  async getFttxSubscriber(ip: string): Promise<NisFttxSubscriber | null> {
    if (!ip) return null
    if (!this.fttxByIpUrl || !this.apiToken) {
      logger.warn(
        'NIS_FTTX_BY_IP_URL or NIS_API_TOKEN is not configured. Skipping FTTX lookup.'
      )
      return null
    }

    try {
      const url = new URL(this.fttxByIpUrl)
      url.searchParams.set('ip', ip)

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
        },
      })

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        logger.error(
          `NIS Gateway (fttx-by-ip) returned error: ${response.status} ${response.statusText}`
        )
        throw new Error(`NIS Gateway error: ${response.status}`)
      }

      const data = (await response.json()) as NisFttxSubscriber
      return data
    } catch (error) {
      logger.error('Failed to contact NIS Gateway for FTTX subscriber', {
        ip,
        error,
      })
      throw error
    }
  }

  /**
   * Verifies a list of IPs against the NIS Gateway (bulk search).
   * Limits each request to a maximum of 64 IPs, performing iterations if more IPs are provided.
   * Returns a set of IPs that are considered valid (registered).
   */
  async verifyIps(ips: string[]): Promise<Set<string>> {
    if (ips.length === 0) return new Set()
    if (!this.ipSearchUrl || !this.apiToken) {
      logger.warn(
        'NIS_IP_SEARCH_URL or NIS_API_TOKEN is not configured. Skipping NIS verification.'
      )
      return new Set(ips) // Assume all valid if not configured
    }

    const CHUNK_SIZE = 64
    const chunks: string[][] = []
    for (let i = 0; i < ips.length; i += CHUNK_SIZE) {
      chunks.push(ips.slice(i, i + CHUNK_SIZE))
    }

    const validIps = new Set<string>()

    for (const chunk of chunks) {
      try {
        const response = await fetch(this.ipSearchUrl, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ips: chunk }),
        })

        if (!response.ok) {
          logger.error(
            `NIS Gateway (ip-search) returned error: ${response.status} ${response.statusText}`
          )
          throw new Error(`NIS Gateway error: ${response.status}`)
        }

        const data = (await response.json()) as {
          results?: Array<{ ip?: string }>
        }

        if (data && Array.isArray(data.results)) {
          for (const result of data.results) {
            if (result?.ip) {
              validIps.add(result.ip)
            }
          }
        }
      } catch (error) {
        logger.error('Failed to contact NIS Gateway for IP batch', {
          batchSize: chunk.length,
          error,
        })
        throw error
      }
    }

    return validIps
  }
}

export const nisClient = new NisClient()
