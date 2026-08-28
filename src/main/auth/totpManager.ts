import { generateSecret, generateURI, verify as otplibVerify } from 'otplib'
import { readSecrets, writeSecrets } from './secretsStore'
import { getSettings, saveSettings } from '../store'
import * as authManager from './authManager'
import type { TotpSetupInfo } from '../../shared/types'

const ISSUER = 'NyxLauncher'
const LABEL = 'panel'

/** Generates a new secret and stores it (unverified — `remoteAccess.totpEnabled`
 *  stays false until verify() confirms the user actually scanned it). Calling
 *  this again before verifying replaces the pending secret, which is fine —
 *  the old QR was never confirmed working. */
export function begin(): TotpSetupInfo {
  const secret = generateSecret()
  writeSecrets({ ...readSecrets(), totpSecret: secret })
  return { otpauthUrl: generateURI({ issuer: ISSUER, label: LABEL, secret }), secret }
}

export async function verify(code: string): Promise<boolean> {
  const valid = await checkCode(code)
  if (valid) {
    const settings = getSettings()
    saveSettings({ ...settings, remoteAccess: { ...settings.remoteAccess, totpEnabled: true } })
  }
  return valid
}

/** Requires the account password again — disabling 2FA is a sensitive enough
 *  action to re-confirm identity, same reasoning as changePassword revoking
 *  every session. */
export function disable(password: string): void {
  if (!authManager.verifyPassword(password)) {
    throw new Error('La contraseña no es correcta')
  }
  writeSecrets({ ...readSecrets(), totpSecret: null })
  const settings = getSettings()
  saveSettings({ ...settings, remoteAccess: { ...settings.remoteAccess, totpEnabled: false } })
}

export async function checkCode(code: string): Promise<boolean> {
  const { totpSecret } = readSecrets()
  if (!totpSecret) return false
  const result = await otplibVerify({ secret: totpSecret, token: code })
  return result.valid
}
