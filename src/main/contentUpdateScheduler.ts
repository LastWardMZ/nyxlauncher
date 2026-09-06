import type { ServerConfig } from '../shared/types'
import { FLAVOR_CONTENT_TYPE } from '../shared/types'
import { contentManager } from './content/contentManager'

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // check every 5 minutes; granular enough for hour-scale schedules

const lastCheckedAt = new Map<string, number>()

async function maybeUpdate(server: ServerConfig, onUpdated: (server: ServerConfig, count: number) => void): Promise<void> {
  if (!server.contentUpdate.autoUpdateHours) return
  if (!FLAVOR_CONTENT_TYPE[server.flavor]) return // vanilla/proxies have no installable content

  const last = lastCheckedAt.get(server.id) ?? Date.now()
  const dueAt = last + server.contentUpdate.autoUpdateHours * 3600_000
  if (Date.now() < dueAt) return
  lastCheckedAt.set(server.id, Date.now())

  try {
    const entries = await contentManager.listInstalled(server)
    let count = 0
    for (const entry of entries.filter((e) => !e.isDependency)) {
      try {
        const updated = await contentManager.update(server, entry.provider, entry.projectId)
        if (updated) count++
      } catch {
        // one mod failing (removed upstream, incompatible now, etc.) shouldn't block the rest
      }
    }
    if (count > 0) onUpdated(server, count)
  } catch {
    // transient — retried next tick since lastCheckedAt was already bumped, same next window
  }
}

export function startContentUpdateScheduler(
  getServers: () => ServerConfig[],
  onUpdated: (server: ServerConfig, count: number) => void
): () => void {
  for (const server of getServers()) {
    if (server.contentUpdate.autoUpdateHours && !lastCheckedAt.has(server.id)) {
      lastCheckedAt.set(server.id, Date.now())
    }
  }

  const interval = setInterval(() => {
    for (const server of getServers()) void maybeUpdate(server, onUpdated)
  }, CHECK_INTERVAL_MS)

  return () => clearInterval(interval)
}
