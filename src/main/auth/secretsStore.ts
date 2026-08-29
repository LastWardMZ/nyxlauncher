import { store } from '../store'
import { platform } from '../platform/platform'

// Small encrypted-at-rest blob for anything that must never sit as plaintext
// in the plain JSON config: the admin password hash today, TOTP secret and
// Cloudflare/Tailscale credentials in later phases. The actual encryption is
// behind the platform adapter — safeStorage (DPAPI/Keychain/libsecret) on
// desktop, AES-256-GCM via Node's own `crypto` in headless/Docker.
export interface RemoteAccessSecrets {
  /** Login now requires both — set together at first-run setup. Not a
   *  secret on its own (it's typed into an open text field, same as any
   *  login form's username), but keeping it alongside the password hash in
   *  the same encrypted blob is simplest and means it never drifts out of
   *  sync with the account it belongs to. */
  username: string | null
  passwordHash: string | null
  /** Base32 TOTP secret. Set as soon as setup begins (unverified); only
   *  `remoteAccess.totpEnabled` in the plain settings tree gates actual use —
   *  see totpManager.ts. */
  totpSecret: string | null
  cloudflareApiToken: string | null
  /** Set once a named tunnel is created via the API, so the app can re-run
   *  `cloudflared tunnel run --token` on later starts without recreating it. */
  cloudflareTunnelId: string | null
  cloudflareTunnelToken: string | null
  resendApiKey: string | null
}

const EMPTY_SECRETS: RemoteAccessSecrets = {
  username: null,
  passwordHash: null,
  totpSecret: null,
  cloudflareApiToken: null,
  cloudflareTunnelId: null,
  cloudflareTunnelToken: null,
  resendApiKey: null
}

const LEGACY_DEFAULT_USERNAME = 'admin'

export function readSecrets(): RemoteAccessSecrets {
  const blob = store.get('remoteAccessSecrets')
  if (!blob) return { ...EMPTY_SECRETS }
  const json = platform.decryptString(blob)
  const secrets = { ...EMPTY_SECRETS, ...JSON.parse(json) }

  // Migration: accounts created before login required a username (every
  // release through v0.9.x) have a passwordHash but no username. Backfill a
  // default rather than locking them out — `admin` is the account this
  // password already unlocks, just under a name now, and it's renameable
  // from Ajustes → Acceso remoto afterward.
  if (secrets.passwordHash && !secrets.username) {
    secrets.username = LEGACY_DEFAULT_USERNAME
    writeSecrets(secrets)
  }

  return secrets
}

export function writeSecrets(secrets: RemoteAccessSecrets): void {
  store.set('remoteAccessSecrets', platform.encryptString(JSON.stringify(secrets)))
}
