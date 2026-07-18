import type { Hono } from 'hono'
import { apiKeyAuth } from '../middlewares/auth.middleware'
import type { MonitorService, RouterService } from '../services/monitor.service'

export const setupRoutes = (
  app: Hono,
  monitorService: MonitorService,
  routerService: RouterService
) => {
  // Apply API key authentication to all /api/* routes
  app.use('/api/*', apiKeyAuth)
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
  app.post('/api/sync', async (c) => {
    // Run sync in the background
    monitorService.syncAllRouters().catch((err) => {
      console.error('[Sync] Background sync error:', err)
    })
    return c.json({ message: 'Sync started in the background' }, 202)
  })

  // --- WEBHOOK ROUTES ---

  app.post('/api/webhook/:router_id/:event', async (c) => {
    const routerId = c.req.param('router_id')
    const event = c.req.param('event')

    // Validate event parameter — only 'up' and 'down' are valid
    if (event !== 'up' && event !== 'down') {
      return c.json({ error: 'Invalid event. Must be "up" or "down"' }, 400)
    }

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

  // Validation helper for router input
  function validateRouter(
    body: unknown
  ): { valid: true; data: Router } | { valid: false; error: string } {
    if (typeof body !== 'object' || body === null) {
      return { valid: false, error: 'Request body must be a JSON object' }
    }

    const r = body as Record<string, unknown>

    // Validate ID
    if (!r.id || typeof r.id !== 'string' || r.id.trim() === '') {
      return {
        valid: false,
        error: '"id" is required and must be a non-empty string',
      }
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(r.id as string)) {
      return {
        valid: false,
        error:
          '"id" must only contain letters, numbers, hyphens, and underscores',
      }
    }

    // Validate base_url
    if (!r.base_url || typeof r.base_url !== 'string') {
      return { valid: false, error: '"base_url" is required' }
    }
    try {
      const url = new URL(r.base_url as string)
      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          valid: false,
          error: '"base_url" must start with http:// or https://',
        }
      }
    } catch {
      return { valid: false, error: '"base_url" must be a valid URL' }
    }

    // Validate username
    if (
      !r.username ||
      typeof r.username !== 'string' ||
      r.username.trim() === ''
    ) {
      return {
        valid: false,
        error: '"username" is required and must be a non-empty string',
      }
    }

    // Validate password
    if (!r.password || typeof r.password !== 'string') {
      return { valid: false, error: '"password" is required' }
    }

    // Return sanitized data
    return {
      valid: true,
      data: {
        id: (r.id as string).trim(),
        base_url: (r.base_url as string).replace(/\/+$/, ''),
        username: (r.username as string).trim(),
        password: r.password as string,
      },
    }
  }

  app.get('/api/routers', async (c) => {
    const routers = await routerService.listRouters()
    return c.json(routers)
  })

  app.post('/api/routers', async (c) => {
    const body = await c.req.json()
    const result = validateRouter(body)
    if (!result.valid) {
      return c.json({ error: result.error }, 400)
    }
    await routerService.addRouter(result.data)
    return c.json({ message: 'Router saved' })
  })

  app.delete('/api/routers/:id', async (c) => {
    await routerService.deleteRouter(c.req.param('id'))
    return c.json({ message: 'Router deleted' })
  })
}
