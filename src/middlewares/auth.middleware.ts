import type { MiddlewareHandler } from 'hono'

export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  const apiKey = process.env.API_KEY
  if (!apiKey) {
    // No API_KEY set = development mode, skip auth
    await next()
    return
  }
  const provided = c.req.header('x-api-key')
  if (provided !== apiKey) {
    return c.json({ error: 'Unauthorized: invalid or missing API key' }, 401)
  }
  await next()
}
