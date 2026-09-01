import type { AlertWebhookClient } from '../infrastructure/alert_webhook.client'
import type { FiberpulseClient } from '../infrastructure/fiberpulse.client'
import type {
  OptraCheckPayload,
  OptraClient,
} from '../infrastructure/optra.client'
import type { DispatchJob, DispatchTarget } from '../models/types'
import type { DispatchJobRepository } from '../repositories/dispatch_job.repository'
import { logger } from '../utils/logger'

export class DispatchWorkerService {
  private isRunning = false
  private optraConcurrency: number
  private fiberpulseConcurrency: number
  private pollIntervalMs: number
  private throttleDelayMs: number
  private retryBaseDelayMs: number

  constructor(
    private dispatchJobRepo: DispatchJobRepository,
    private optraClient: OptraClient,
    private fiberpulseClient: FiberpulseClient,
    private alertWebhookClient: AlertWebhookClient
  ) {
    this.optraConcurrency = Math.max(
      1,
      parseInt(process.env.DISPATCH_OPTRA_CONCURRENCY || '5', 10)
    )
    this.fiberpulseConcurrency = Math.max(
      1,
      parseInt(process.env.DISPATCH_FIBERPULSE_CONCURRENCY || '5', 10)
    )
    this.pollIntervalMs = parseInt(
      process.env.DISPATCH_POLL_INTERVAL_MS || '200',
      10
    )
    this.throttleDelayMs = parseInt(
      process.env.DISPATCH_THROTTLE_DELAY_MS || '50',
      10
    )
    this.retryBaseDelayMs = parseInt(
      process.env.DISPATCH_RETRY_BASE_DELAY_MS || '3000',
      10
    )
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async start(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true

    // Recover jobs stuck in 'processing' state before startup
    try {
      await this.dispatchJobRepo.resetProcessingJobs()
      logger.info('Reset any stuck processing dispatch jobs to pending')
    } catch (err) {
      logger.error('Failed to reset processing dispatch jobs on startup', {
        error: err,
      })
    }

    logger.info('Starting DispatchWorkerService worker pools', {
      optraConcurrency: this.optraConcurrency,
      fiberpulseConcurrency: this.fiberpulseConcurrency,
      pollIntervalMs: this.pollIntervalMs,
      throttleDelayMs: this.throttleDelayMs,
      retryBaseDelayMs: this.retryBaseDelayMs,
    })

    // Start concurrent worker pools per target
    for (let i = 0; i < this.optraConcurrency; i++) {
      this.runTargetLoop('optra', i + 1)
    }

    for (let i = 0; i < this.fiberpulseConcurrency; i++) {
      this.runTargetLoop('fiberpulse', i + 1)
    }
  }

  stop(): void {
    this.isRunning = false
    logger.info('Stopping DispatchWorkerService')
  }

  private async runTargetLoop(
    target: DispatchTarget,
    workerId: number
  ): Promise<void> {
    while (this.isRunning) {
      try {
        const job = await this.dispatchJobRepo.claimNextPending(target)

        if (!job) {
          await this.sleep(this.pollIntervalMs)
          continue
        }

        await this.processJob(job)

        // Throttle between consecutive tasks for this worker
        if (this.throttleDelayMs > 0) {
          await this.sleep(this.throttleDelayMs)
        }
      } catch (err) {
        logger.error(
          `Unexpected error in dispatch loop for ${target} [Worker #${workerId}]`,
          {
            error: err,
          }
        )
        await this.sleep(this.pollIntervalMs)
      }
    }
  }

  private async processJob(job: DispatchJob): Promise<void> {
    logger.debug(
      `Processing dispatch job #${job.id} for target ${job.target} (${job.event ?? 'unknown'})`,
      {
        jobId: job.id,
        target: job.target,
        event: job.event,
        attempt: job.attempts + 1,
      }
    )

    try {
      let responseText: string | null = null
      if (job.target === 'optra') {
        const payload = JSON.parse(job.payload) as OptraCheckPayload
        responseText = await this.optraClient.checkSubscriber(payload)
      } else if (job.target === 'fiberpulse') {
        const payload = JSON.parse(job.payload) as { circuit_id: string }
        responseText = await this.fiberpulseClient.syncOlt(payload.circuit_id)
      }

      await this.dispatchJobRepo.markCompleted(job.id, responseText)
      logger.info(
        `Dispatch job #${job.id} for target ${job.target} (${job.event ?? 'unknown'}) completed successfully`,
        {
          jobId: job.id,
          target: job.target,
          event: job.event,
        }
      )

      // Trigger LOS alert webhook if applicable
      await this.checkAndSendLosAlert(job, responseText)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const nextAttempt = job.attempts + 1
      const isFinal = nextAttempt >= job.max_attempts

      if (isFinal) {
        logger.error(
          `Dispatch job #${job.id} for ${job.target} failed permanently after ${nextAttempt} attempts`,
          {
            jobId: job.id,
            target: job.target,
            error: errorMessage,
          }
        )
        await this.dispatchJobRepo.markFailed(job.id, errorMessage, null, true)
      } else {
        const backoffDelay = this.retryBaseDelayMs * Math.pow(2, job.attempts)
        const nextRunAt = new Date(Date.now() + backoffDelay)

        logger.warn(
          `Dispatch job #${job.id} for ${job.target} failed (attempt ${nextAttempt}/${job.max_attempts}), retrying in ${backoffDelay}ms`,
          {
            jobId: job.id,
            target: job.target,
            error: errorMessage,
            nextRunAt: nextRunAt.toISOString(),
          }
        )
        await this.dispatchJobRepo.markFailed(
          job.id,
          errorMessage,
          nextRunAt,
          false
        )
      }
    }
  }

  private async checkAndSendLosAlert(
    job: DispatchJob,
    responseText: string | null
  ): Promise<void> {
    if (!responseText) return

    try {
      if (job.target === 'optra') {
        const res = JSON.parse(responseText)
        let raw = res.raw_response
        if (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw)
          } catch {
            raw = {}
          }
        }

        const runState = (res.run_state || raw?.runState || '').toLowerCase()
        // Do not send alert if current run_state is online
        if (runState === 'online') {
          return
        }

        const cause = res.last_down_cause
        if (
          cause &&
          typeof cause === 'string' &&
          cause.toUpperCase().includes('LOS')
        ) {
          const payload = JSON.parse(job.payload || '{}')
          const downTime =
            raw?.lastDownTime ||
            new Date().toISOString().replace('T', ' ').slice(0, 19)
          const circuitId = payload.circuit_id || res.circuit_id || ''
          const homepassId = payload.homepass_id || res.homepass_id || ''
          const message =
            `${cause} ${downTime} ${circuitId} ${homepassId}`.trim()
          await this.alertWebhookClient.sendAlert(message)
        }
      } else if (job.target === 'fiberpulse') {
        const res = JSON.parse(responseText)
        const data = res?.data
        const status = (data?.status || '').toLowerCase()
        const phaseState = data?.phase_state
        const lastCause = data?.last_offline_cause

        // Do not send alert if current status is online or phase_state is working
        if (status === 'online' || phaseState?.toLowerCase() === 'working') {
          return
        }

        const isLos =
          (typeof phaseState === 'string' &&
            phaseState.toUpperCase().includes('LOS')) ||
          (typeof lastCause === 'string' &&
            lastCause.toUpperCase().includes('LOS'))

        if (isLos) {
          const payload = JSON.parse(job.payload || '{}')
          const cause = phaseState || lastCause || 'LOS'
          const downTime =
            data?.last_offline_time ||
            new Date().toISOString().replace('T', ' ').slice(0, 19)
          const circuitId = payload.circuit_id || data?.subscriber_id || ''
          const message = `${cause} ${downTime} ${circuitId}`.trim()
          await this.alertWebhookClient.sendAlert(message)
        }
      }
    } catch (err) {
      logger.error('Error checking/dispatching LOS alert', {
        jobId: job.id,
        target: job.target,
        error: err,
      })
    }
  }
}
