import { safeStorage } from 'electron'
import { store } from '../store'

// Small encrypted-at-rest blob for anything that must never sit as plaintext
// in the plain JSON config: the admin password hash today, TOTP secret and
// Cloudflare/Tailscale credentials in later phases. safeStorage is backed by
// DPAPI on Windows (Keychain on macOS, libsecret on Linux) — no new
// dependency, no key management of our own.
export interface RemoteAccessSecrets {
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
  passwordHash: null,
  totpSecret: null,
  cloudflareApiToken: null,
  cloudflareTunnelId: null,
  cloudflareTunnelToken: null,
  resendApiKey: null
}

export function readSecrets(): RemoteAccessSecrets {
  const blob = store.get('remoteAccessSecrets')
  if (!blob) return { ...EMPTY_SECRETS }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('El cifrado seguro del sistema operativo no está disponible en esta máquina')
  }
  try {
    const json = safeStorage.decryptString(Buffer.from(blob, 'base64'))
    return { ...EMPTY_SECRETS, ...JSON.parse(json) }
  } catch {
    throw new Error('No se pudieron leer los secretos de acceso remoto (¿se movió el perfil de usuario de Windows?)')
  }
}

export function writeSecrets(secrets: RemoteAccessSecrets): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('El cifrado seguro del sistema operativo no está disponible en esta máquina')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(secrets))
  store.set('remoteAccessSecrets', encrypted.toString('base64'))
}
