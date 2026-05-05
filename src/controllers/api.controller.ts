import type { Hono } from 'hono'
import type { MonitorService, RouterService } from '../services/monitor.service'

export const setupRoutes = (
  app: Hono,
  monitorService: MonitorService,
  routerService: RouterService
) => {
  // --- SESSION ROUTES ---

  // Check single IP
  app.get('/api/status/:ip', (c) => {
    const ip = c.req.param('ip')
    return c.json(monitorService.getStatusByIp(ip))
  })

  // Bulk check IPs
  app.post('/api/status/bulk', async (c) => {
    const { ips } = await c.req.json()
    if (!Array.isArray(ips))
      return c.json({ error: 'ips must be an array' }, 400)
    return c.json(monitorService.getBulkStatus(ips))
  })

  // List all online
  app.get('/api/online', (c) => {
    return c.json(monitorService.getAllOnline())
  })

  // Force Sync
  app.get('/api/sync', async (c) => {
    await monitorService.syncAllRouters()
    return c.json({ message: 'Sync completed' })
  })

  // --- WEBHOOK ROUTES ---

  app.post('/api/webhook/:router_id/:event', async (c) => {
    const routerId = c.req.param('router_id')
    const event = c.req.param('event') as 'up' | 'down'

    // Mikrotik sends data as form-urlencoded usually with /tool fetch http-data
    const body = await c.req.parseBody()
    const username = body.user as string
    const ip = body.ip as string

    if (!username) return c.json({ error: 'Missing user' }, 400)

    monitorService.updateFromWebhook(
      routerId,
      username,
      ip || '',
      event === 'up' ? 'online' : 'offline'
    )

    return c.json({ success: true })
  })

  // --- ROUTER MANAGEMENT ---

  app.get('/api/routers', (c) => {
    return c.json(routerService.listRouters())
  })

  app.post('/api/routers', async (c) => {
    const router = await c.req.json()
    routerService.addRouter(router)
    return c.json({ message: 'Router saved' })
  })

  app.delete('/api/routers/:id', (c) => {
    routerService.deleteRouter(c.req.param('id'))
    return c.json({ message: 'Router deleted' })
  })
}
