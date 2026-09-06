import { JsonStore } from './jsonStore'
import { platform } from './platform/platform'
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_BACKUP_CONFIG,
  DEFAULT_CONTENT_UPDATE_CONFIG,
  DEFAULT_MAP_RENDER_CONFIG,
  DEFAULT_REMOTE_ACCESS_SETTINGS,
  DEFAULT_RESOURCE_ALERT_CONFIG,
  DEFAULT_RESTART_CONFIG,
  DEFAULT_UPDATE_CHECK_CONFIG
} from '../shared/types'
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
  /** Which account logged in — gates what this session's /api/invoke calls can
   *  reach (see OPERATOR_ALLOWED_CHANNELS in remoteBridge.ts). Absent on
   *  sessions created before roles existed — treated as 'admin' at read time
   *  (that's the only kind of account that existed then). */
  role?: 'admin' | 'operator'
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
  /** Role of whoever most recently logged in from this device — the pending-
   *  approval flow issues its session later, in a separate request that has
   *  no other memory of which account started it, so this is what that later
   *  request reads back. Absent on devices trusted before roles existed —
   *  treated as 'admin' at read time (the only kind of account then). */
  role?: 'admin' | 'operator'
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

// Lazy: `platform.getDataDir()` needs `setPlatform()` to have already run,
// which happens in bootstrapElectron.ts/bootstrapNode.ts — but that
// bootstrap module's own import of platform.electron.ts pulls in this very
// file (for the settings check inside `notify()`), so constructing the
// store eagerly at module load time would call `platform.getDataDir()`
// before `setPlatform()` ever executes. Deferring construction to first use
// breaks that cycle.
let instance: JsonStore<PersistedSchema> | null = null

function getStore(): JsonStore<PersistedSchema> {
  if (!instance) {
    instance = new JsonStore<PersistedSchema>({
      name: 'nyxlauncher-config',
      cwd: platform.getDataDir(),
      defaults: {
        servers: [],
        settings: DEFAULT_APP_SETTINGS,
        remoteAccessSecrets: null,
        remoteSessions: [],
        trustedDevices: [],
        accessLog: []
      }
    })
  }
  return instance
}

export const store = {
  get: <K extends keyof PersistedSchema>(key: K): PersistedSchema[K] => getStore().get(key),
  set: <K extends keyof PersistedSchema>(key: K, value: PersistedSchema[K]): void => getStore().set(key, value)
}

/** Backfills nested config objects for servers saved before a given field existed —
 *  a plain top-level default merge (see getSettings()) doesn't reach inside
 *  objects that already exist on disk under an older shape. */
export function getServers(): ServerConfig[] {
  return store.get('servers').map((s) => ({
    ...s,
    backup: { ...DEFAULT_BACKUP_CONFIG, ...s.backup },
    updateCheck: { ...DEFAULT_UPDATE_CHECK_CONFIG, ...s.updateCheck },
    mapRender: { ...DEFAULT_MAP_RENDER_CONFIG, ...s.mapRender },
    restart: { ...DEFAULT_RESTART_CONFIG, ...s.restart },
    resourceAlerts: { ...DEFAULT_RESOURCE_ALERT_CONFIG, ...s.resourceAlerts },
    contentUpdate: { ...DEFAULT_CONTENT_UPDATE_CONFIG, ...s.contentUpdate }
  }))
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
