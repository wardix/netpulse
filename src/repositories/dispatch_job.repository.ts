import db from '../db/database'
import type {
  DispatchJob,
  DispatchJobStatus,
  DispatchTarget,
  NewDispatchJob,
} from '../models/types'

function mapTimestamp(val: unknown): string | undefined {
  if (!val) return undefined
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'string') {
    let s = val
    if (!s.includes('T')) {
      s = s.replace(' ', 'T')
    }
    if (!s.endsWith('Z') && !s.includes('+') && !s.includes('-')) {
      s += 'Z'
    }
    return s
  }
  return String(val)
}

function mapDispatchJob(row: Record<string, unknown>): DispatchJob {
  return {
    id: Number(row.id),
    target: row.target as DispatchTarget,
    event: row.event as string | null | undefined,
    subscriber_id:
      row.subscriber_id != null ? String(row.subscriber_id) : undefined,
    circuit_id: row.circuit_id as string | null | undefined,
    payload: row.payload as string,
    response_payload: row.response_payload as string | null | undefined,
    status: row.status as DispatchJobStatus,
    attempts: Number(row.attempts || 0),
    max_attempts: Number(row.max_attempts || 3),
    last_error: row.last_error as string | null | undefined,
    next_run_at: mapTimestamp(row.next_run_at),
    created_at: mapTimestamp(row.created_at),
    updated_at: mapTimestamp(row.updated_at),
  }
}

function formatDbDate(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

export class DispatchJobRepository {
  async enqueue(job: NewDispatchJob): Promise<void> {
    const maxAttempts = job.max_attempts ?? 3
    const subscriberIdStr =
      job.subscriber_id != null ? String(job.subscriber_id) : null
    const circuitIdStr = job.circuit_id ?? null
    await db.run(
      `INSERT INTO dispatch_jobs (target, event, subscriber_id, circuit_id, payload, max_attempts, status, attempts, next_run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        job.target,
        job.event ?? null,
        subscriberIdStr,
        circuitIdStr,
        job.payload,
        maxAttempts,
      ]
    )
  }

  async fetchNextPending(target: DispatchTarget): Promise<DispatchJob | null> {
    const row = await db
      .query(
        `SELECT * FROM dispatch_jobs
         WHERE target = ?
           AND status = 'pending'
           AND next_run_at <= CURRENT_TIMESTAMP
         ORDER BY id ASC
         LIMIT 1`
      )
      .get(target)

    return row ? mapDispatchJob(row) : null
  }

  async markProcessing(id: number): Promise<void> {
    await db.run(
      `UPDATE dispatch_jobs
       SET status = 'processing',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    )
  }

  async markCompleted(
    id: number,
    responsePayload?: string | null
  ): Promise<void> {
    await db.run(
      `UPDATE dispatch_jobs
       SET status = 'completed',
           response_payload = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [responsePayload || null, id]
    )
  }

  async markFailed(
    id: number,
    error: string,
    nextRunAt: Date | null,
    isFinal: boolean
  ): Promise<void> {
    if (isFinal) {
      await db.run(
        `UPDATE dispatch_jobs
         SET status = 'failed',
             attempts = attempts + 1,
             last_error = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [error, id]
      )
    } else {
      const nextDateStr = nextRunAt
        ? formatDbDate(nextRunAt)
        : formatDbDate(new Date())
      await db.run(
        `UPDATE dispatch_jobs
         SET status = 'pending',
             attempts = attempts + 1,
             last_error = ?,
             next_run_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [error, nextDateStr, id]
      )
    }
  }

  async resetProcessingJobs(): Promise<void> {
    await db.run(
      `UPDATE dispatch_jobs
       SET status = 'pending',
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'processing'`
    )
  }
}
