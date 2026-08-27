import si from 'systeminformation'
import type { ServerManager } from './serverManager'

const POLL_INTERVAL_MS = 2000

/**
 * Polls CPU/RAM for every currently running server and feeds the results
 * back into the ServerManager, which re-broadcasts state changes.
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

        // The pid we spawn (and track) is rarely the one actually doing the work:
        // a .bat/.cmd launch (e.g. Forge/NeoForge's run.bat) is tracked via its
        // wrapping cmd.exe, which just sits idle while the real java.exe child
        // does everything; java.exe itself can also silently re-exec as a child
        // process on Windows to apply certain memory flags. Either way, the real
        // CPU/RAM usage lives in a descendant, not the tracked pid — so sum the
        // whole process tree rooted at it instead of reading that one pid alone.
        const childrenByParent = new Map<number, number[]>()
        const byPid = new Map<number, (typeof list)[number]>()
        for (const proc of list) {
          byPid.set(proc.pid, proc)
          const siblings = childrenByParent.get(proc.parentPid)
          if (siblings) siblings.push(proc.pid)
          else childrenByParent.set(proc.parentPid, [proc.pid])
        }

        for (const [rootPid, id] of pidToId) {
          if (!byPid.has(rootPid)) continue
          if (!startedAt.has(id)) startedAt.set(id, Date.now())
          const uptimeSeconds = Math.floor((Date.now() - (startedAt.get(id) ?? Date.now())) / 1000)

          let cpu = 0
          let memRssKb = 0
          const stack = [rootPid]
          const visited = new Set<number>()
          while (stack.length > 0) {
            const pid = stack.pop() as number
            if (visited.has(pid)) continue
            visited.add(pid)
            const proc = byPid.get(pid)
            if (proc) {
              cpu += proc.cpu ?? 0
              memRssKb += proc.memRss ?? 0
            }
            for (const childPid of childrenByParent.get(pid) ?? []) stack.push(childPid)
          }

          manager.applyMetrics(id, {
            cpuPercent: Math.round(cpu * 10) / 10,
            memoryMb: Math.round(memRssKb / 1024),
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
