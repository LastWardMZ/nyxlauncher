import type { ServerConfig } from '../shared/types'
import * as mapCliManager from './mapCliManager'
import { getMapStatus } from './mapManager'

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // check every 5 minutes; granular enough for hour-scale schedules

async function maybeRender(server: ServerConfig): Promise<void> {
  if (server.flavor !== 'vanilla' || !server.mapRender.scheduleHours) return
  if (mapCliManager.isRendering(server.id)) return // a render can take minutes; never overlap two for the same server

  const status = await getMapStatus(server)
  // Don't nag a half-configured server every 5 minutes — the user has to finish setup
  // (install the CLI, prepare the config) from the tab first.
  if (status.phase !== 'ready' && status.phase !== 'cli-ready') return

  const dueAt = status.lastRenderedAt ? new Date(status.lastRenderedAt).getTime() + server.mapRender.scheduleHours * 3600_000 : 0
  if (Date.now() < dueAt) return

  try {
    // Fire-and-forget: startRender resolves once the process is spawned, not once it
    // finishes. Completion (success or failure) is reported separately via
    // mapCliManager.mapCliRenderEvents, which index.ts subscribes to regardless of
    // whether a render was triggered here or manually from the tab.
    await mapCliManager.startRender(server)
  } catch {
    // A start failure (e.g. spawn error) never records a new success, so it's still
    // "due" and will simply be retried next tick.
  }
}

export function startMapRenderScheduler(getServers: () => ServerConfig[]): () => void {
  const interval = setInterval(() => {
    for (const server of getServers()) {
      void maybeRender(server)
    }
  }, CHECK_INTERVAL_MS)

  // Also check shortly after startup so schedules aren't only evaluated every 5 minutes from launch.
  const initialTimeout = setTimeout(() => {
    for (const server of getServers()) {
      void maybeRender(server)
    }
  }, 15_000)

  return () => {
    clearInterval(interval)
    clearTimeout(initialTimeout)
  }
}
