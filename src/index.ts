import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { SessionRepository } from './repositories/session.repository'
import { RouterRepository } from './repositories/router.repository'
import { DispatchJobRepository } from './repositories/dispatch_job.repository'
import { MikrotikClient } from './infrastructure/mikrotik.client'
import { optraClient } from './infrastructure/optra.client'
import { fiberpulseClient } from './infrastructure/fiberpulse.client'
import { MonitorService, RouterService } from './services/monitor.service'
import { DispatchWorkerService } from './services/dispatch_worker.service'
import { setupRoutes } from './controllers/api.controller'

const app = new Hono()

app.use('*', logger())

// Dependency Injection
const sessionRepo = new SessionRepository()
const routerRepo = new RouterRepository()
const dispatchJobRepo = new DispatchJobRepository()
const mikrotikClient = new MikrotikClient()

const monitorService = new MonitorService(
  sessionRepo,
  routerRepo,
  mikrotikClient,
  dispatchJobRepo
)
const routerService = new RouterService(routerRepo)
const dispatchWorkerService = new DispatchWorkerService(
  dispatchJobRepo,
  optraClient,
  fiberpulseClient
)

// Setup Routes
setupRoutes(app, monitorService, routerService)

// Global error handler — catches any unhandled throw in route handlers
app.onError((err, c) => {
  console.error('[Error]', err.message, err.stack)
  return c.json({ error: err.message || 'Internal Server Error' }, 500)
})

// 404 handler — catches requests to undefined routes
app.notFound((c) => {
  return c.json(
    { error: `Route not found: ${c.req.method} ${c.req.path}` },
    404
  )
})

const port = parseInt(process.env.PORT || '3000', 10)

Bun.serve({
  port: port,
  fetch: app.fetch,
})

console.log(`NetPulse Server running on port ${port}`)

// Start Background Queue Workers
dispatchWorkerService.start().catch((err) => {
  console.error('[Worker] Error starting DispatchWorkerService:', err)
})

// Periodic Background Jobs
const checkIntervalMinutes = parseInt(
  process.env.ROGUE_CHECK_INTERVAL_MINUTES || '10',
  10
)
const checkIntervalMs = checkIntervalMinutes * 60 * 1000

console.log(
  `Scheduled self-healing rogue check every ${checkIntervalMinutes} minutes`
)
setInterval(() => {
  monitorService.checkRogueSessions().catch((err) => {
    console.error('[PeriodicCheck] Error running checkRogueSessions:', err)
  })
}, checkIntervalMs)
