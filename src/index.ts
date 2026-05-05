import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { SessionRepository } from './repositories/session.repository'
import { RouterRepository } from './repositories/router.repository'
import { MikrotikClient } from './infrastructure/mikrotik.client'
import { MonitorService, RouterService } from './services/monitor.service'
import { setupRoutes } from './controllers/api.controller'

const app = new Hono()

app.use('*', logger())

// Dependency Injection
const sessionRepo = new SessionRepository()
const routerRepo = new RouterRepository()
const mikrotikClient = new MikrotikClient()

const monitorService = new MonitorService(
  sessionRepo,
  routerRepo,
  mikrotikClient
)
const routerService = new RouterService(routerRepo)

// Setup Routes
setupRoutes(app, monitorService, routerService)

const port = parseInt(process.env.PORT || '3000', 10)

Bun.serve({
  port: port,
  fetch: app.fetch,
})

console.log(`NetPulse Server running on port ${port}`)
