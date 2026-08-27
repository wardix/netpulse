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
  is_rogue?: boolean
}

export interface MikrotikActiveSession {
  name: string
  address: string
  uptime: string
}

export type DispatchTarget = 'optra' | 'fiberpulse'
export type DispatchJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'

export interface DispatchJob {
  id: number
  target: DispatchTarget
  event?: string | null
  payload: string
  response_payload?: string | null
  status: DispatchJobStatus
  attempts: number
  max_attempts: number
  last_error?: string | null
  next_run_at?: string
  created_at?: string
  updated_at?: string
}

export interface NewDispatchJob {
  target: DispatchTarget
  event?: string | null
  payload: string
  max_attempts?: number
}
