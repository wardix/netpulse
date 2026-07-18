export interface Router {
  id: string
  base_url: string
  username: string
  password: string
}

// Safe version without sensitive fields
export type RouterPublic = Omit<Router, 'password'>

export interface Session {
  id?: number
  router_id: string
  username: string
  ip_address: string
  status: 'online' | 'offline'
  last_update?: string
  uptime?: string
}

export interface MikrotikActiveSession {
  name: string
  address: string
  uptime: string
}
