import type { ServerConfig } from '../shared/types'
import { createBackup, latestBackupAt } from './backupManager'
import { serverManager } from './serverManager'

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // check every 5 minutes; granular enough for hour-scale schedules

async function maybeBackup(server: ServerConfig, onBackupDone: (server: ServerConfig) => void): Promise<void> {
  if (!server.backup.scheduleHours) return

  const latest = await latestBackupAt(server.id)
  const dueAt = latest ? latest.getTime() + server.backup.scheduleHours * 3600_000 : 0
  if (Date.now() < dueAt) return

  try {
    // Best-effort: nudge a running server to flush its world to disk before we zip it.
    if (serverManager.isRunning(server.id)) {
      serverManager.sendCommand(server.id, 'save-all')
      await new Promise((r) => setTimeout(r, 2000))
    }
    await createBackup(server)
    onBackupDone(server)
  } catch {
    // Swallow — a failed scheduled backup shouldn't crash the loop; it'll retry next tick since no new backup was recorded.
  }
}

export function startBackupScheduler(
  getServers: () => ServerConfig[],
  onBackupDone: (server: ServerConfig) => void
): () => void {
  const interval = setInterval(() => {
    for (const server of getServers()) {
      void maybeBackup(server, onBackupDone)
    }
  }, CHECK_INTERVAL_MS)

  // Also check shortly after startup so schedules aren't only evaluated every 5 minutes from launch.
  const initialTimeout = setTimeout(() => {
    for (const server of getServers()) {
      void maybeBackup(server, onBackupDone)
    }
  }, 15_000)

  return () => {
    clearInterval(interval)
    clearTimeout(initialTimeout)
  }
}
