import { env } from 'bun'
import { logger } from '../utils/logger'

export class AlertWebhookClient {
  private webhookUrl: string
  private token: string
  private recipient: string

  constructor() {
    this.webhookUrl = env.LOS_WEBHOOK_URL || env.ALERT_WEBHOOK_URL || ''
    this.token = env.LOS_WEBHOOK_TOKEN || env.ALERT_WEBHOOK_TOKEN || ''
    this.recipient = env.LOS_WEBHOOK_TO || env.ALERT_WEBHOOK_TO || ''
  }

  /**
   * Sends a message payload to the configured LOS webhook URL.
   */
  async sendAlert(message: string): Promise<void> {
    if (!this.webhookUrl) {
      logger.warn(
        'LOS_WEBHOOK_URL is not configured. Skipping LOS alert webhook.'
      )
      return
    }

    try {
      logger.info('Sending LOS alert webhook', {
        message,
        url: this.webhookUrl,
        to: this.recipient,
      })

      const headers: Record<string, string> = {
        accept: 'application/json',
        'Content-Type': 'application/json',
      }

      if (this.token) {
        headers.Authorization = this.token.startsWith('Bearer ')
          ? this.token
          : `Bearer ${this.token}`
      }

      const body = {
        to: this.recipient,
        body: 'text',
        text: message,
      }

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const responseText = await response.text()
        logger.error(
          `LOS alert webhook returned error: ${response.status} ${response.statusText}${responseText ? ` - ${responseText}` : ''}`,
          { message }
        )
      } else {
        logger.info('LOS alert webhook delivered successfully', { message })
      }
    } catch (error) {
      logger.error('Failed to dispatch LOS alert webhook', {
        message,
        error,
      })
    }
  }
}

export const alertWebhookClient = new AlertWebhookClient()
