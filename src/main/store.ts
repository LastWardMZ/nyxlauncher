import Store from 'electron-store'
import { DEFAULT_APP_SETTINGS, DEFAULT_REMOTE_ACCESS_SETTINGS } from '../shared/types'
import type { AppSettings, ServerConfig, AccessLogEntry } from '../shared/types'

/** A logged-in browser session. `tokenHash` is sha256(raw bearer token) — the
 *  raw token itself is only ever handed to the client once, as a cookie, at
 *  login time, and never persisted. See src/main/auth/sessionManager.ts. */
export interface PersistedRemoteSession {
  id: string
  tokenHash: string
  createdAt: string
  lastSeenAt: string
  userAgent: string
  ip: string
  /** Links to PersistedDevice.id — revoking a device revokes its sessions too. */
  deviceId: string | null
}

/** A remembered browser/device, identified by a long-lived cookie separate
 *  from the session cookie (see deviceManager.ts). A 'pending' record is
 *  waiting on the emailed approval link — approvalTokenHash is only set
 *  while pending, and is a hash of the one-time token (the raw token lives
 *  only in the email, never stored). */
export interface PersistedDevice {
  id: string
  fingerprint: string
  status: 'trusted' | 'pending'
  approvalTokenHash: string | null
  createdAt: string
  lastSeenAt: string
  userAgent: string
  ip: string
}

interface PersistedSchema {
  servers: ServerConfig[]
  settings: AppSettings
  /** Base64 blob from safeStorage.encryptString, containing JSON secrets
   *  (password hash, TOTP secret, Cloudflare/Resend API keys). Never stored
   *  as plaintext — see src/main/auth/secretsStore.ts. */
  remoteAccessSecrets: string | null
  remoteSessions: PersistedRemoteSession[]
  trustedDevices: PersistedDevice[]
  /** Capped/rotated — see accessLog.ts. */
  accessLog: AccessLogEntry[]
}

export const store = new Store<PersistedSchema>({
  name: 'nyxlauncher-config',
  defaults: {
    servers: [],
    settings: DEFAULT_APP_SETTINGS,
    remoteAccessSecrets: null,
    remoteSessions: [],
    trustedDevices: [],
    accessLog: []
  }
})

export function getServers(): ServerConfig[] {
  return store.get('servers')
}

export function saveServers(servers: ServerConfig[]): void {
  store.set('servers', servers)
}

export function getSettings(): AppSettings {
  const stored = store.get('settings')
  // A shallow merge only backfills *top-level* missing keys — fine the first
  // time `remoteAccess` itself is introduced, but not when a later update
  // adds new fields *inside* an object that already exists on disk (exactly
  // what happened adding ipAllowlist/notifyEmail on top of an existing
  // remoteAccess from Fases 1-2). Merge that one level deeper too.
  return {
    ...DEFAULT_APP_SETTINGS,
    ...stored,
    remoteAccess: { ...DEFAULT_REMOTE_ACCESS_SETTINGS, ...stored?.remoteAccess }
  }
}

export function saveSettings(settings: AppSettings): void {
  store.set('settings', settings)
}
