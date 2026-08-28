import { readSecrets, writeSecrets } from './secretsStore'
import { getSettings } from '../store'
import type { EmailConfigStatus } from '../../shared/types'

const RESEND_API_URL = 'https://api.resend.com/emails'
// Resend requires a verified sending domain for a custom "from" — their
// shared onboarding address works out of the box with no setup, which is
// exactly what a single API-key paste-and-go flow needs here.
const FROM_ADDRESS = 'NyxLauncher <onboarding@resend.dev>'

export function getStatus(): EmailConfigStatus {
  return { configured: readSecrets().resendApiKey !== null }
}

export function setApiKey(apiKey: string): void {
  writeSecrets({ ...readSecrets(), resendApiKey: apiKey.trim() || null })
}

async function send(subject: string, bodyText: string): Promise<void> {
  const { resendApiKey } = readSecrets()
  const to = getSettings().remoteAccess.notifyEmail.trim()
  if (!resendApiKey || !to) return // notifications are opt-in — silently no-op if unconfigured

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, text: bodyText })
  })
  if (!res.ok) {
    console.error('emailSender: Resend request failed', res.status, await res.text().catch(() => ''))
  }
}

export async function sendDeviceApprovalEmail(approveUrl: string, ip: string, userAgent: string): Promise<void> {
  await send(
    'Nuevo dispositivo esperando acceso a NyxLauncher',
    [
      `Un dispositivo nuevo intentó entrar al panel de NyxLauncher.`,
      ``,
      `IP: ${ip}`,
      `Navegador: ${userAgent}`,
      ``,
      `Si has sido tú, aprueba el dispositivo aquí:`,
      approveUrl,
      ``,
      `Si no reconoces este intento, ignora este correo — el dispositivo se queda sin acceso.`
    ].join('\n')
  )
}

export async function sendNewLoginEmail(revokeUrl: string, ip: string, userAgent: string): Promise<void> {
  await send(
    'Nuevo inicio de sesión en NyxLauncher',
    [
      `Se ha iniciado sesión en el panel de NyxLauncher.`,
      ``,
      `IP: ${ip}`,
      `Navegador: ${userAgent}`,
      ``,
      `Si no has sido tú, revoca esta sesión aquí:`,
      revokeUrl
    ].join('\n')
  )
}
