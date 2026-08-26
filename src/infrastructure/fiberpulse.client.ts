import { env } from 'bun'
import { logger } from '../utils/logger'

export class FiberpulseClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = env.FIBERPULSE_API_URL || ''
  }

  /**
   * Triggers OLT synchronization for subscriber in Fiberpulse (Operator ID 1).
   * No authentication header is required.
   */
  async syncOlt(circuitId: string): Promise<string> {
    if (!this.baseUrl) {
      logger.warn(
        'FIBERPULSE_API_URL is not configured. Skipping Fiberpulse sync-olt.'
      )
      return ''
    }

    if (!circuitId) {
      logger.warn('Missing circuit_id for Fiberpulse sync-olt.')
      return ''
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

      const responseText = await response.text()

      if (!response.ok) {
        const errorMsg = `Fiberpulse API returned error: ${response.status} ${response.statusText}${responseText ? ` - ${responseText}` : ''}`
        logger.error(errorMsg, { circuitId })
        throw new Error(errorMsg)
      }

      logger.info('Successfully notified Fiberpulse API sync-olt', {
        circuitId,
      })

      return responseText
    } catch (error) {
      logger.error('Failed to dispatch request to Fiberpulse API', {
        circuitId,
        error,
      })
      throw error
    }
  }
}

export const fiberpulseClient = new FiberpulseClient()
