import { env } from 'bun'
import { logger } from '../utils/logger'

export class AlertWebhookClient {
  private webhookUrl: string

  constructor() {
    this.webhookUrl = env.LOS_WEBHOOK_URL || env.ALERT_WEBHOOK_URL || ''
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
      })
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      })

      if (!response.ok) {
        logger.error(
          `LOS alert webhook returned error: ${response.status} ${response.statusText}`,
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
