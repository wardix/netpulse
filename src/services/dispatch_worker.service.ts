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
  private pollIntervalMs: number
  private throttleDelayMs: number
  private retryBaseDelayMs: number

  constructor(
    private dispatchJobRepo: DispatchJobRepository,
    private optraClient: OptraClient,
    private fiberpulseClient: FiberpulseClient
  ) {
    this.pollIntervalMs = parseInt(
      process.env.DISPATCH_POLL_INTERVAL_MS || '500',
      10
    )
    this.throttleDelayMs = parseInt(
      process.env.DISPATCH_THROTTLE_DELAY_MS || '300',
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

    logger.info('Starting DispatchWorkerService loops', {
      pollIntervalMs: this.pollIntervalMs,
      throttleDelayMs: this.throttleDelayMs,
      retryBaseDelayMs: this.retryBaseDelayMs,
    })

    // Start concurrent serial loops per target
    this.runTargetLoop('optra')
    this.runTargetLoop('fiberpulse')
  }

  stop(): void {
    this.isRunning = false
    logger.info('Stopping DispatchWorkerService')
  }

  private async runTargetLoop(target: DispatchTarget): Promise<void> {
    while (this.isRunning) {
      try {
        const job = await this.dispatchJobRepo.fetchNextPending(target)

        if (!job) {
          await this.sleep(this.pollIntervalMs)
          continue
        }

        await this.processJob(job)

        // Throttle between consecutive tasks
        if (this.throttleDelayMs > 0) {
          await this.sleep(this.throttleDelayMs)
        }
      } catch (err) {
        logger.error(`Unexpected error in dispatch loop for ${target}`, {
          error: err,
        })
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

    await this.dispatchJobRepo.markProcessing(job.id)

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
}
