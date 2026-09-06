import { randomBytes, randomUUID, createHash } from 'crypto'
import { store, type PersistedRemoteSession } from '../store'
import { getSettings } from '../store'
import type { RemoteSessionInfo } from '../../shared/types'

const TOKEN_BYTES = 32

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function getAll(): PersistedRemoteSession[] {
  return store.get('remoteSessions')
}

function saveAll(sessions: PersistedRemoteSession[]): void {
  store.set('remoteSessions', sessions)
}

function isExpired(session: PersistedRemoteSession): boolean {
  const minutes = getSettings().remoteAccess.sessionInactivityMinutes
  if (!minutes || minutes <= 0) return false
  const lastSeen = new Date(session.lastSeenAt).getTime()
  return Date.now() - lastSeen > minutes * 60_000
}

/** Creates a session and returns the raw bearer token — hand it to the
 *  client as a cookie immediately; it is never retrievable again. */
export function createSession(
  userAgent: string,
  ip: string,
  deviceId: string | null = null,
  role: 'admin' | 'operator' = 'admin'
): { token: string; id: string } {
  const token = randomBytes(TOKEN_BYTES).toString('hex')
  const now = new Date().toISOString()
  const session: PersistedRemoteSession = {
    id: randomUUID(),
    tokenHash: hashToken(token),
    createdAt: now,
    lastSeenAt: now,
    userAgent,
    ip,
    deviceId,
    role
  }
  const sessions = getAll().filter((s) => !isExpired(s))
  saveAll([...sessions, session])
  return { token, id: session.id }
}

/** Revokes every session tied to a given device — called when that device is
 *  revoked (Phase 3 trusted-devices), so kicking a device out actually ends
 *  its live sessions, not just future logins. */
export function revokeSessionsForDevice(deviceId: string): void {
  saveAll(getAll().filter((s) => s.deviceId !== deviceId))
}

/** Validates a bearer token, touching lastSeenAt on success. Returns the
 *  session id and role, or null if the token is missing/invalid/expired.
 *  Sessions created before roles existed have no stored role — they can only
 *  be the one admin account that existed at the time. */
export function touchSession(token: string): { id: string; role: 'admin' | 'operator' } | null {
  const tokenHash = hashToken(token)
  const sessions = getAll()
  const idx = sessions.findIndex((s) => s.tokenHash === tokenHash)
  if (idx === -1) return null
  const session = sessions[idx]
  if (isExpired(session)) {
    saveAll(sessions.filter((_, i) => i !== idx))
    return null
  }
  const next = [...sessions]
  next[idx] = { ...session, lastSeenAt: new Date().toISOString() }
  saveAll(next)
  return { id: session.id, role: session.role ?? 'admin' }
}

export function listSessions(currentToken: string | null): RemoteSessionInfo[] {
  const currentHash = currentToken ? hashToken(currentToken) : null
  return getAll()
    .filter((s) => !isExpired(s))
    .map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      userAgent: s.userAgent,
      ip: s.ip,
      current: s.tokenHash === currentHash
    }))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
}

export function revokeSession(id: string): void {
  saveAll(getAll().filter((s) => s.id !== id))
}

export function revokeAllSessions(): void {
  saveAll([])
}
