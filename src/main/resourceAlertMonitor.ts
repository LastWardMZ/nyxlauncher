import type { ServerConfig, ServerRuntimeState } from '../shared/types'
import { serverManager } from './serverManager'
import * as emailSender from './auth/emailSender'

// Once a threshold is breached, wait this long before alerting again for the
// same server+metric — otherwise every 2s metrics tick (see metrics.ts) would
// fire an email for as long as the server stays over the line.
const ALERT_COOLDOWN_MS = 30 * 60 * 1000

const lastAlertAt = new Map<string, number>()

function checkThreshold(serverName: string, key: string, value: number, threshold: number | null, kind: 'cpu' | 'ram'): void {
  if (threshold === null) return
  if (value < threshold) {
    lastAlertAt.delete(key)
    return
  }
  const last = lastAlertAt.get(key) ?? 0
  if (Date.now() - last < ALERT_COOLDOWN_MS) return
  lastAlertAt.set(key, Date.now())
  void emailSender.sendResourceAlertEmail(serverName, kind, value, threshold)
}

export function startResourceAlertMonitor(getServers: () => ServerConfig[]): () => void {
  const listener = (state: ServerRuntimeState): void => {
    if (!state.metrics) return
    const server = getServers().find((s) => s.id === state.id)
    if (!server) return

    checkThreshold(server.name, `${server.id}:cpu`, state.metrics.cpuPercent, server.resourceAlerts.cpuPercentThreshold, 'cpu')

    if (server.java.maxMemoryMb > 0) {
      const ramPercent = (state.metrics.memoryMb / server.java.maxMemoryMb) * 100
      checkThreshold(server.name, `${server.id}:ram`, ramPercent, server.resourceAlerts.ramPercentThreshold, 'ram')
    }
  }

  serverManager.on('stateChanged', listener)
  return () => serverManager.off('stateChanged', listener)
}
