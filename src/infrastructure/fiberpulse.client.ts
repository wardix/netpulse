import { env } from 'bun'
import { logger } from '../utils/logger'

export class FiberpulseClient {
  private baseUrl: string

  constructor() {
    this.baseUrl =
      env.FIBERPULSE_API_URL ||
      'https://transit.is5x.nusa.net.id/fiberpulse/api'
  }

  /**
   * Triggers OLT synchronization for subscriber in Fiberpulse (Operator ID 1).
   * No authentication header is required.
   */
  async syncOlt(circuitId: string): Promise<void> {
    if (!this.baseUrl) {
      logger.warn(
        'FIBERPULSE_API_URL is not configured. Skipping Fiberpulse sync-olt.'
      )
      return
    }

    if (!circuitId) {
      logger.warn('Missing circuit_id for Fiberpulse sync-olt.')
      return
    }

    try {
      const normalizedBaseUrl = this.baseUrl.replace(/\/+$/, '')
      const encodedCircuitId = encodeURIComponent(circuitId)
      const url = `${normalizedBaseUrl}/subscribers/${encodedCircuitId}/sync-olt`

      logger.info('Dispatching sync-olt request to Fiberpulse API', {
        circuitId,
        url,
      })

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        logger.error(
          `Fiberpulse API returned error: ${response.status} ${response.statusText}`,
          { circuitId }
        )
      } else {
        logger.info('Successfully notified Fiberpulse API sync-olt', {
          circuitId,
        })
      }
    } catch (error) {
      logger.error('Failed to dispatch request to Fiberpulse API', {
        circuitId,
        error,
      })
    }
  }
}

export const fiberpulseClient = new FiberpulseClient()
