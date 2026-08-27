import Store from 'electron-store'
import { DEFAULT_APP_SETTINGS } from '../shared/types'
import type { AppSettings, ServerConfig } from '../shared/types'

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
}

interface PersistedSchema {
  servers: ServerConfig[]
  settings: AppSettings
  /** Base64 blob from safeStorage.encryptString, containing JSON secrets
   *  (password hash, and later TOTP secret / Cloudflare token). Never stored
   *  as plaintext — see src/main/auth/secretsStore.ts. */
  remoteAccessSecrets: string | null
  remoteSessions: PersistedRemoteSession[]
}

export const store = new Store<PersistedSchema>({
  name: 'nyxlauncher-config',
  defaults: {
    servers: [],
    settings: DEFAULT_APP_SETTINGS,
    remoteAccessSecrets: null,
    remoteSessions: []
  }
})

export function getServers(): ServerConfig[] {
  return store.get('servers')
}

export function saveServers(servers: ServerConfig[]): void {
  store.set('servers', servers)
}

export function getSettings(): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, ...store.get('settings') }
}

export function saveSettings(settings: AppSettings): void {
  store.set('settings', settings)
}
