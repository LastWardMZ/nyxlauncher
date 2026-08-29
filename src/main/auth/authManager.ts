import bcrypt from 'bcryptjs'
import { readSecrets, writeSecrets } from './secretsStore'

const BCRYPT_ROUNDS = 12
const MIN_PASSWORD_LENGTH = 8
const MIN_USERNAME_LENGTH = 3

export function isAccountConfigured(): boolean {
  // readSecrets() backfills `username` for pre-v1.0 accounts, so checking
  // passwordHash alone is enough — it also keeps this matching exactly what
  // it always meant ("is there an account"), not "is the newer field set".
  return readSecrets().passwordHash !== null
}

export function getUsername(): string | null {
  return readSecrets().username
}

function validateUsername(username: string): void {
  if (username.trim().length < MIN_USERNAME_LENGTH) {
    throw new Error(`El usuario debe tener al menos ${MIN_USERNAME_LENGTH} caracteres`)
  }
}

function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  }
}

/** First-run setup: fails if an account already exists — use
 *  changeUsername/changePassword to rotate either afterwards. */
export function setCredentials(username: string, password: string): void {
  if (isAccountConfigured()) {
    throw new Error('Ya existe una cuenta configurada')
  }
  validateUsername(username)
  validatePassword(password)
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
  writeSecrets({ ...readSecrets(), username: username.trim(), passwordHash })
}

export function changePassword(currentPassword: string, newPassword: string): void {
  const secrets = readSecrets()
  if (!secrets.passwordHash || !bcrypt.compareSync(currentPassword, secrets.passwordHash)) {
    throw new Error('La contraseña actual no es correcta')
  }
  validatePassword(newPassword)
  writeSecrets({ ...secrets, passwordHash: bcrypt.hashSync(newPassword, BCRYPT_ROUNDS) })
}

export function changeUsername(currentPassword: string, newUsername: string): void {
  const secrets = readSecrets()
  if (!secrets.passwordHash || !bcrypt.compareSync(currentPassword, secrets.passwordHash)) {
    throw new Error('La contraseña actual no es correcta')
  }
  validateUsername(newUsername)
  writeSecrets({ ...secrets, username: newUsername.trim() })
}

/** Full login check — both username and password have to match. */
export function verifyCredentials(username: string, password: string): boolean {
  const secrets = readSecrets()
  if (!secrets.username || !secrets.passwordHash) return false
  if (secrets.username !== username.trim()) return false
  return bcrypt.compareSync(password, secrets.passwordHash)
}

/** Password-only re-confirmation for an already-authenticated session (e.g.
 *  before disabling 2FA) — the session cookie already proves who's asking,
 *  so this is just "are you still you", not a second full login. */
export function verifyPasswordOnly(password: string): boolean {
  const secrets = readSecrets()
  if (!secrets.passwordHash) return false
  return bcrypt.compareSync(password, secrets.passwordHash)
}
