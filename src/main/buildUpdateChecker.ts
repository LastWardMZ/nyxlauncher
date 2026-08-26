import type { ServerConfig } from '../shared/types'
import { latestBuildId } from './minecraftDownloader'

const CHECK_INTERVAL_MS = 5 * 60 * 1000

/**
 * Periodically compares each server's installed build (recorded when it was
 * fetched via the built-in downloader) against the latest build the
 * Paper/Purpur/Velocity API reports for that same version, and notifies once
 * per newly-detected update. Far more reliable than scraping console output —
 * this is the same API the downloader itself uses to list builds.
 */
export function startBuildUpdateChecker(
  getServers: () => ServerConfig[],
  onUpdateAvailable: (server: ServerConfig, latestBuild: string) => void
): () => void {
  const lastCheckedAt = new Map<string, number>()
  const notifiedForBuild = new Map<string, string>()

  async function checkOne(server: ServerConfig): Promise<void> {
    const installed = server.installedBuild
    if (!installed || (installed.flavor !== 'paper' && installed.flavor !== 'purpur' && installed.flavor !== 'velocity')) {
      return
    }
    if (!server.updateCheck.autoCheckHours) return

    const dueAt = (lastCheckedAt.get(server.id) ?? 0) + server.updateCheck.autoCheckHours * 3600_000
    if (Date.now() < dueAt) return
    lastCheckedAt.set(server.id, Date.now())

    try {
      const latest = await latestBuildId(installed.flavor, installed.version)
      if (!latest || latest === installed.buildId) return
      if (notifiedForBuild.get(server.id) === latest) return
      notifiedForBuild.set(server.id, latest)
      onUpdateAvailable(server, latest)
    } catch {
      // Transient network/API errors just get retried next tick.
    }
  }

  function tick(): void {
    for (const server of getServers()) void checkOne(server)
  }

  const interval = setInterval(tick, CHECK_INTERVAL_MS)
  const initialTimeout = setTimeout(tick, 20_000)

  return () => {
    clearInterval(interval)
    clearTimeout(initialTimeout)
  }
}
