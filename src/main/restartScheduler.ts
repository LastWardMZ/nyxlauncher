import type { ServerConfig } from '../shared/types'
import { serverManager } from './serverManager'

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // check every 5 minutes; granular enough for hour-scale schedules

const lastRestartAt = new Map<string, number>()

function maybeRestart(server: ServerConfig, onRestart: (server: ServerConfig) => void): void {
  if (!server.restart.scheduleHours) return
  if (!serverManager.isRunning(server.id)) return

  const last = lastRestartAt.get(server.id) ?? Date.now()
  const dueAt = last + server.restart.scheduleHours * 3600_000
  if (Date.now() < dueAt) return

  lastRestartAt.set(server.id, Date.now())
  serverManager.sendCommand(server.id, 'say Reiniciando el servidor por mantenimiento programado...')
  serverManager.restart(server)
  onRestart(server)
}

export function startRestartScheduler(getServers: () => ServerConfig[], onRestart: (server: ServerConfig) => void): () => void {
  // Seed lastRestartAt at startup so the clock starts from launch time rather
  // than restarting immediately for a server whose schedule was already "due"
  // before the app even started.
  for (const server of getServers()) {
    if (server.restart.scheduleHours && !lastRestartAt.has(server.id)) {
      lastRestartAt.set(server.id, Date.now())
    }
  }

  const interval = setInterval(() => {
    for (const server of getServers()) maybeRestart(server, onRestart)
  }, CHECK_INTERVAL_MS)

  return () => clearInterval(interval)
}
