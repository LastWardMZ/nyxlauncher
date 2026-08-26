import si from 'systeminformation'
import type { ServerManager } from './serverManager'

const POLL_INTERVAL_MS = 2000

/**
 * Polls CPU/RAM for every currently running server pid and feeds the
 * results back into the ServerManager, which re-broadcasts state changes.
 */
export function startMetricsLoop(manager: ServerManager, getRunningIds: () => string[]): () => void {
  const startedAt = new Map<string, number>()

  const interval = setInterval(() => {
    void (async () => {
      const ids = getRunningIds()
      for (const trackedId of startedAt.keys()) {
        if (!ids.includes(trackedId)) startedAt.delete(trackedId)
      }
      if (ids.length === 0) return

      const pidToId = new Map<number, string>()
      for (const id of ids) {
        const pid = manager.getPid(id)
        if (pid) pidToId.set(pid, id)
      }
      if (pidToId.size === 0) return

      try {
        // si.processLoad() matches by process *name*, not pid, so we pull the
        // full process list once per tick and pick out the pids we care about.
        const { list } = await si.processes()
        for (const proc of list) {
          const id = pidToId.get(proc.pid)
          if (!id) continue
          if (!startedAt.has(id)) startedAt.set(id, Date.now())
          const uptimeSeconds = Math.floor((Date.now() - (startedAt.get(id) ?? Date.now())) / 1000)
          manager.applyMetrics(id, {
            cpuPercent: Math.round((proc.cpu ?? 0) * 10) / 10,
            memoryMb: Math.round((proc.memRss ?? 0) / 1024),
            uptimeSeconds
          })
        }
      } catch {
        // systeminformation can throw transiently (e.g. process just exited); ignore and retry next tick.
      }
    })()
  }, POLL_INTERVAL_MS)

  return () => clearInterval(interval)
}
