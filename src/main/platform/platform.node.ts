import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import type { Platform } from './platform'

const IV_LENGTH = 12
const KEY_LENGTH = 32

// No OS keyring in a bare container (safeStorage's Linux backend needs
// libsecret/D-Bus, which normally isn't running there) — AES-256-GCM via
// Node's own `crypto` instead, keyed by NYXLAUNCHER_SECRET_KEY if the user
// sets one, or a key generated once and persisted alongside the rest of the
// config volume so it survives restarts/updates as long as the whole volume
// moves together (documented in the Docker README as a tradeoff: restoring
// the config without the key file loses the secrets).
function loadOrCreateKey(): Buffer {
  const envKey = process.env.NYXLAUNCHER_SECRET_KEY
  if (envKey) {
    const buf = Buffer.from(envKey, /^[0-9a-fA-F]+$/.test(envKey) ? 'hex' : 'base64')
    if (buf.length !== KEY_LENGTH) {
      throw new Error(`NYXLAUNCHER_SECRET_KEY debe decodificar a ${KEY_LENGTH} bytes (hex o base64)`)
    }
    return buf
  }

  const dataDir = process.env.NYXLAUNCHER_DATA_DIR ?? join(tmpdir(), 'nyxlauncher-data')
  const keyPath = join(dataDir, 'secret.key')
  if (existsSync(keyPath)) return readFileSync(keyPath)

  mkdirSync(dataDir, { recursive: true })
  const key = randomBytes(KEY_LENGTH)
  writeFileSync(keyPath, key, { mode: 0o600 })
  return key
}

let cachedKey: Buffer | null = null
function getKey(): Buffer {
  if (!cachedKey) cachedKey = loadOrCreateKey()
  return cachedKey
}

// Headless/Docker: no display, no window, ever — every native picker is
// unreachable by construction (same shape ipc.ts's `if (!win) return null`
// guard already handles for the desktop build when there's no window; here
// there's simply never a window to pass in the first place). The manual
// text-path inputs already present throughout the renderer are the real
// path for these flows in this mode.
export const nodePlatform: Platform = {
  getDataDir: () => process.env.NYXLAUNCHER_DATA_DIR ?? join(tmpdir(), 'nyxlauncher-data'),
  getTempDir: () => tmpdir(),

  getAppVersion() {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string }
    return pkg.version
  },

  isPackaged: () => true,

  async pickDirectory() {
    return null
  },

  async pickFile() {
    return null
  },

  async pickFilesToImport() {
    return []
  },

  async pickSaveFile() {
    return null
  },

  notify() {
    // The same events already travel over the panel's WebSocket — no
    // native notification daemon to hand this to in a bare container.
  },

  setLaunchOnStartup() {
    // No such concept for a container.
  },

  checkForUpdates() {
    // Docker updates are `docker pull` + recreate, documented in the README.
  },

  encryptString(plain) {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
  },

  decryptString(blob) {
    try {
      const raw = Buffer.from(blob, 'base64')
      const iv = raw.subarray(0, IV_LENGTH)
      const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16)
      const ciphertext = raw.subarray(IV_LENGTH + 16)
      const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
      decipher.setAuthTag(authTag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    } catch {
      throw new Error('No se pudieron leer los secretos de acceso remoto (¿cambió NYXLAUNCHER_SECRET_KEY o secret.key?)')
    }
  }
}
