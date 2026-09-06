import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { readSecrets, writeSecrets, type OperatorAccountSecret } from './secretsStore'
import type { OperatorAccount } from '../../shared/types'

const BCRYPT_ROUNDS = 12
const MIN_PASSWORD_LENGTH = 8
const MIN_USERNAME_LENGTH = 3

export interface AccountMatch {
  role: 'admin' | 'operator'
  /** 'admin' for the primary account (there's only ever one), else the operator's id. */
  accountId: string
}

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

/** Full login check — both username and password have to match, against
 *  either the one admin account or any operator account. */
export function verifyCredentials(username: string, password: string): AccountMatch | null {
  const secrets = readSecrets()
  const trimmed = username.trim()

  if (secrets.username && secrets.passwordHash && secrets.username === trimmed) {
    return bcrypt.compareSync(password, secrets.passwordHash) ? { role: 'admin', accountId: 'admin' } : null
  }

  const operator = secrets.operatorAccounts.find((o) => o.username === trimmed)
  if (operator && bcrypt.compareSync(password, operator.passwordHash)) {
    return { role: 'operator', accountId: operator.id }
  }
  return null
}

function toPublicOperator(o: OperatorAccountSecret): OperatorAccount {
  return { id: o.id, username: o.username }
}

export function listOperators(): OperatorAccount[] {
  return readSecrets().operatorAccounts.map(toPublicOperator)
}

/** Requires the admin's own password, same as changePassword/changeUsername —
 *  creating a second account is exactly as sensitive as changing the first. */
export function addOperator(adminPassword: string, username: string, password: string): OperatorAccount {
  const secrets = readSecrets()
  if (!secrets.passwordHash || !bcrypt.compareSync(adminPassword, secrets.passwordHash)) {
    throw new Error('La contraseña de administrador no es correcta')
  }
  validateUsername(username)
  validatePassword(password)
  const trimmed = username.trim()
  if (secrets.username === trimmed || secrets.operatorAccounts.some((o) => o.username === trimmed)) {
    throw new Error('Ya existe una cuenta con ese usuario')
  }
  const operator: OperatorAccountSecret = { id: randomUUID(), username: trimmed, passwordHash: bcrypt.hashSync(password, BCRYPT_ROUNDS) }
  writeSecrets({ ...secrets, operatorAccounts: [...secrets.operatorAccounts, operator] })
  return toPublicOperator(operator)
}

export function removeOperator(adminPassword: string, operatorId: string): void {
  const secrets = readSecrets()
  if (!secrets.passwordHash || !bcrypt.compareSync(adminPassword, secrets.passwordHash)) {
    throw new Error('La contraseña de administrador no es correcta')
  }
  writeSecrets({ ...secrets, operatorAccounts: secrets.operatorAccounts.filter((o) => o.id !== operatorId) })
}

/** Password-only re-confirmation for an already-authenticated session (e.g.
 *  before disabling 2FA) — the session cookie already proves who's asking,
 *  so this is just "are you still you", not a second full login. */
export function verifyPasswordOnly(password: string): boolean {
  const secrets = readSecrets()
  if (!secrets.passwordHash) return false
  return bcrypt.compareSync(password, secrets.passwordHash)
}
