import { env } from 'bun'
import { logger } from '../utils/logger'

export interface OptraCheckPayload {
  subscriber_id: number
  circuit_id: string
  homepass_id: string
}

export class OptraClient {
  private apiUrl: string

  constructor() {
    this.apiUrl =
      env.OPTRA_API_URL || 'https://transit.is5x.nusa.net.id/optra/api/check'
  }

  /**
   * Sends subscriber check notification to Optra API (Operator ID 22).
   * No authentication header is required.
   */
  async checkSubscriber(payload: OptraCheckPayload): Promise<void> {
    if (!this.apiUrl) {
      logger.warn('OPTRA_API_URL is not configured. Skipping Optra check.')
      return
    }

    try {
      logger.info('Dispatching check request to Optra API', { payload })
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        logger.error(
          `Optra API returned error: ${response.status} ${response.statusText}`,
          { payload }
        )
      } else {
        logger.info('Successfully notified Optra API', {
          subscriber_id: payload.subscriber_id,
        })
      }
    } catch (error) {
      logger.error('Failed to dispatch request to Optra API', {
        payload,
        error,
      })
    }
  }
}

export const optraClient = new OptraClient()
