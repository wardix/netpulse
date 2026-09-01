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

    // Supersede any existing pending jobs for the same circuit before inserting new event
    if (circuitIdStr) {
      await db.run(
        `UPDATE dispatch_jobs
         SET status = 'failed',
             last_error = 'Skipped: Superseded by newer event',
             updated_at = CURRENT_TIMESTAMP
         WHERE target = ?
           AND circuit_id = ?
           AND status = 'pending'`,
        [job.target, circuitIdStr]
      )
    }

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

  async claimNextPending(target: DispatchTarget): Promise<DispatchJob | null> {
    const candidates = await db
      .query(
        `SELECT id FROM dispatch_jobs
         WHERE target = ?
           AND status = 'pending'
           AND next_run_at <= CURRENT_TIMESTAMP
         ORDER BY id ASC
         LIMIT 10`
      )
      .all(target)

    if (!candidates || candidates.length === 0) return null

    const token = `claim-${crypto.randomUUID()}`

    for (const candidate of candidates) {
      const jobId = Number(candidate.id)
      if (!jobId) continue

      // Atomically try to claim this job
      await db.run(
        `UPDATE dispatch_jobs
         SET status = 'processing',
             last_error = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
        [token, jobId]
      )

      // Verify if this worker won the claim
      const row = await db
        .query(
          `SELECT * FROM dispatch_jobs
           WHERE id = ? AND status = 'processing' AND last_error = ?`
        )
        .get(jobId, token)

      if (row) {
        // Clear the claim token from last_error
        await db.run(
          `UPDATE dispatch_jobs SET last_error = NULL WHERE id = ?`,
          [jobId]
        )
        return mapDispatchJob({ ...row, last_error: null })
      }
    }

    return null
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

  async expireStalePendingJobs(maxAgeMinutes: number): Promise<void> {
    if (maxAgeMinutes <= 0) return

    const threshold = new Date(
      Date.now() - maxAgeMinutes * 60 * 1000
    ).toISOString()

    await db.run(
      `UPDATE dispatch_jobs
       SET status = 'failed',
           last_error = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending'
         AND created_at < ?`,
      [
        `Skipped: Stale pending job older than ${maxAgeMinutes} minutes`,
        threshold,
      ]
    )
  }

  async coalescePendingDuplicates(): Promise<void> {
    await db.run(
      `UPDATE dispatch_jobs
       SET status = 'failed',
           last_error = 'Skipped: Superseded by newer pending job',
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending'
         AND circuit_id IS NOT NULL
         AND circuit_id != ''
         AND id NOT IN (
           SELECT MAX(id)
           FROM dispatch_jobs
           WHERE status = 'pending'
             AND circuit_id IS NOT NULL
             AND circuit_id != ''
           GROUP BY target, circuit_id
         )`
    )
  }

  async hasNewerPending(
    id: number,
    target: DispatchTarget,
    circuitId: string
  ): Promise<boolean> {
    const row = await db
      .query(
        `SELECT id FROM dispatch_jobs
         WHERE target = ?
           AND circuit_id = ?
           AND id > ?
           AND status IN ('pending', 'processing', 'completed')
         LIMIT 1`
      )
      .get(target, circuitId, id)
    return !!row
  }
}
