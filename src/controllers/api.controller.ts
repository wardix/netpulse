import type { Hono } from 'hono'
import type { MonitorService, RouterService } from '../services/monitor.service'

export const setupRoutes = (
  app: Hono,
  monitorService: MonitorService,
  routerService: RouterService
) => {
  // --- SESSION ROUTES ---

  // Check single IP
  app.get('/api/status/:ip', async (c) => {
    const ip = c.req.param('ip')
    const result = await monitorService.getStatusByIp(ip)
    return c.json(result)
  })

  // Bulk check IPs
  app.post('/api/status/bulk', async (c) => {
    const { ips } = await c.req.json()
    if (!Array.isArray(ips))
      return c.json({ error: 'ips must be an array' }, 400)
    const result = await monitorService.getBulkStatus(ips)
    return c.json(result)
  })

  // List all online
  app.get('/api/online', async (c) => {
    const result = await monitorService.getAllOnline()
    return c.json(result)
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

    await monitorService.updateFromWebhook(
      routerId,
      username,
      ip || '',
      event === 'up' ? 'online' : 'offline'
    )

    return c.json({ success: true })
  })

  // --- ROUTER MANAGEMENT ---

  app.get('/api/routers', async (c) => {
    const routers = await routerService.listRouters()
    return c.json(routers)
  })

  app.post('/api/routers', async (c) => {
    const router = await c.req.json()
    if (!router?.base_url || !router?.username || !router?.password) {
      return c.json(
        { error: 'Missing required fields: base_url, username, password' },
        400
      )
    }
    // normalize base_url (remove trailing slash)
    router.base_url = router.base_url.replace(/\/+$|\/$/, '')
    await routerService.addRouter(router)
    return c.json({ message: 'Router saved' })
  })

  app.delete('/api/routers/:id', async (c) => {
    await routerService.deleteRouter(c.req.param('id'))
    return c.json({ message: 'Router deleted' })
  })
}
