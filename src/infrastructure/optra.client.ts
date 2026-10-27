import { env } from 'bun'
import { logger } from '../utils/logger'

export interface OptraCheckPayload {
  subscriber_id: number
  circuit_id: string
  homepass_id: string
}

export class OptraClient {
  private apiUrl: string
  private timeoutMs: number

  constructor() {
    this.apiUrl = env.OPTRA_API_URL || ''
    this.timeoutMs = parseInt(env.OPTRA_TIMEOUT_MS || '10000', 10)
  }

  /**
   * Sends subscriber check notification to Optra API (Operator ID 22).
   * No authentication header is required.
   */
  async checkSubscriber(payload: OptraCheckPayload): Promise<string> {
    if (!this.apiUrl) {
      logger.warn('OPTRA_API_URL is not configured. Skipping Optra check.')
      return ''
    }

    try {
      logger.info('Dispatching check request to Optra API', {
        payload,
        timeoutMs: this.timeoutMs,
      })
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      const responseText = await response.text()

      if (!response.ok) {
        const errorMsg = `Optra API returned error: ${response.status} ${response.statusText}${responseText ? ` - ${responseText}` : ''}`
        logger.error(errorMsg, { payload })
        throw new Error(errorMsg)
      }

      logger.info('Successfully notified Optra API', {
        subscriber_id: payload.subscriber_id,
      })

      return responseText
    } catch (error) {
      logger.error('Failed to dispatch request to Optra API', {
        payload,
        error,
      })
      throw error
    }
  }
}

export const optraClient = new OptraClient()
