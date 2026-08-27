import bcrypt from 'bcryptjs'
import { readSecrets, writeSecrets } from './secretsStore'

const BCRYPT_ROUNDS = 12
const MIN_PASSWORD_LENGTH = 8

export function isAccountConfigured(): boolean {
  return readSecrets().passwordHash !== null
}

/** First-run setup: fails if an account already exists — use changePassword to rotate it. */
export function setPassword(password: string): void {
  if (isAccountConfigured()) {
    throw new Error('Ya existe una cuenta configurada; usa el cambio de contraseña')
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  }
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
  writeSecrets({ ...readSecrets(), passwordHash })
}

export function changePassword(currentPassword: string, newPassword: string): void {
  const secrets = readSecrets()
  if (!secrets.passwordHash || !bcrypt.compareSync(currentPassword, secrets.passwordHash)) {
    throw new Error('La contraseña actual no es correcta')
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  }
  writeSecrets({ ...secrets, passwordHash: bcrypt.hashSync(newPassword, BCRYPT_ROUNDS) })
}

export function verifyPassword(password: string): boolean {
  const secrets = readSecrets()
  if (!secrets.passwordHash) return false
  return bcrypt.compareSync(password, secrets.passwordHash)
}
