// In-memory, per-IP brute-force guard for /api/auth/login. Deliberately not
// persisted — an app restart resetting the counters is an acceptable
// trade-off for something whose only job is slowing down an attacker in the
// current session; the access log (accessLog.ts) keeps the durable history.

const LOCKOUT_STEPS_MS = [60_000, 5 * 60_000, 30 * 60_000]
const FAILURES_BEFORE_LOCKOUT = 5

interface IpState {
  failures: number
  lockedUntil: number | null
  lockStepIndex: number
}

const state = new Map<string, IpState>()

function getOrCreate(ip: string): IpState {
  let entry = state.get(ip)
  if (!entry) {
    entry = { failures: 0, lockedUntil: null, lockStepIndex: -1 }
    state.set(ip, entry)
  }
  return entry
}

/** Returns remaining lockout milliseconds, or 0 if not currently locked. */
export function getLockoutRemainingMs(ip: string): number {
  const entry = state.get(ip)
  if (!entry?.lockedUntil) return 0
  const remaining = entry.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

export function recordFailure(ip: string): void {
  const entry = getOrCreate(ip)
  entry.failures += 1
  if (entry.failures >= FAILURES_BEFORE_LOCKOUT) {
    entry.lockStepIndex = Math.min(entry.lockStepIndex + 1, LOCKOUT_STEPS_MS.length - 1)
    entry.lockedUntil = Date.now() + LOCKOUT_STEPS_MS[entry.lockStepIndex]
    entry.failures = 0
  }
}

export function recordSuccess(ip: string): void {
  state.delete(ip)
}
