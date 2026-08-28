import { randomBytes, randomUUID, createHash } from 'crypto'
import { store, type PersistedDevice } from '../store'
import * as sessionManager from './sessionManager'
import type { TrustedDeviceInfo } from '../../shared/types'

const DEVICE_COOKIE_BYTES = 24

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function getAll(): PersistedDevice[] {
  return store.get('trustedDevices')
}

function saveAll(devices: PersistedDevice[]): void {
  store.set('trustedDevices', devices)
}

export function generateDeviceCookieValue(): string {
  return randomBytes(DEVICE_COOKIE_BYTES).toString('hex')
}

export function fingerprint(deviceCookieValue: string, userAgent: string): string {
  return hashToken(`${deviceCookieValue}|${userAgent}`)
}

export type DeviceCheckResult =
  | { status: 'trusted'; deviceId: string }
  | { status: 'pending'; deviceId: string }
  | { status: 'unknown' }

export function checkDevice(fp: string): DeviceCheckResult {
  const device = getAll().find((d) => d.fingerprint === fp)
  if (!device) return { status: 'unknown' }
  return { status: device.status, deviceId: device.id }
}

/** Creates a pending-approval record and returns the *raw* one-time approval
 *  token — this is the only place it ever exists outside the email it goes
 *  into; only its hash is persisted. */
export function createPendingApproval(fp: string, ip: string, userAgent: string): { deviceId: string; approvalToken: string } {
  const approvalToken = randomBytes(24).toString('hex')
  const now = new Date().toISOString()
  const device: PersistedDevice = {
    id: randomUUID(),
    fingerprint: fp,
    status: 'pending',
    approvalTokenHash: hashToken(approvalToken),
    createdAt: now,
    lastSeenAt: now,
    userAgent,
    ip
  }
  saveAll([...getAll(), device])
  return { deviceId: device.id, approvalToken }
}

/** Called from the emailed approval link. Returns the approved device id, or
 *  null if the token doesn't match anything pending (already used/invalid). */
export function approveByToken(rawToken: string): string | null {
  const tokenHash = hashToken(rawToken)
  const devices = getAll()
  const idx = devices.findIndex((d) => d.status === 'pending' && d.approvalTokenHash === tokenHash)
  if (idx === -1) return null
  const next = [...devices]
  next[idx] = { ...next[idx], status: 'trusted', approvalTokenHash: null, lastSeenAt: new Date().toISOString() }
  saveAll(next)
  return next[idx].id
}

/** Polled by the original browser tab while it waits on the emailed link. */
export function isDeviceTrusted(deviceId: string): boolean {
  return getAll().find((d) => d.id === deviceId)?.status === 'trusted'
}

export function listDevices(): TrustedDeviceInfo[] {
  return getAll()
    .map((d) => ({
      id: d.id,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
      userAgent: d.userAgent,
      ip: d.ip,
      status: d.status
    }))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
}

export function revokeDevice(id: string): void {
  saveAll(getAll().filter((d) => d.id !== id))
  sessionManager.revokeSessionsForDevice(id)
}
