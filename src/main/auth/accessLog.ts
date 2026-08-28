import { randomUUID } from 'crypto'
import { store } from '../store'
import type { AccessLogEntry } from '../../shared/types'

const MAX_ENTRIES = 2000

export function record(ip: string, result: AccessLogEntry['result'], userAgent: string): void {
  const entry: AccessLogEntry = { id: randomUUID(), timestamp: new Date().toISOString(), ip, result, userAgent }
  const next = [...store.get('accessLog'), entry]
  store.set('accessLog', next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next)
}

export function list(): AccessLogEntry[] {
  return [...store.get('accessLog')].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
