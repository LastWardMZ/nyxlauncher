import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useServerStore } from '@renderer/store/serverStore'
import type { ServerConfig } from '@shared/types'

// Forge/NeoForge deliberately excluded — updating them means re-running the
// installer, not just swapping a jar, which this update flow doesn't do.
const CHECKABLE_FLAVORS = new Set(['paper', 'purpur', 'velocity', 'folia', 'fabric', 'bungeecord'])

export function BuildUpdatePill({ server }: { server: ServerConfig }): JSX.Element | null {
  const updateServer = useServerStore((s) => s.updateServer)
  const [checking, setChecking] = useState(false)
  const [latestBuildId, setLatestBuildId] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)

  useEffect(() => {
    const offDone = window.launcher.events.onDownloadDone(async (result) => {
      if (result.jobId !== jobId) return
      setUpdating(false)
      setJobId(null)
      if (result.success && result.installedBuild) {
        await updateServer({ ...server, executable: result.executable, installedBuild: result.installedBuild })
        setLatestBuildId(null)
      }
    })
    return offDone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const installed = server.installedBuild
  if (!installed || !CHECKABLE_FLAVORS.has(installed.flavor)) return null

  async function handleCheck(): Promise<void> {
    setChecking(true)
    try {
      const builds = await window.launcher.minecraft.listBuilds(installed!.flavor, installed!.version)
      const latest = builds[0]?.id ?? null
      setLatestBuildId(latest && latest !== installed!.buildId ? latest : null)
    } finally {
      setChecking(false)
    }
  }

  async function handleUpdate(): Promise<void> {
    if (!latestBuildId) return
    setUpdating(true)
    const id = await window.launcher.minecraft.download(
      installed!.flavor,
      installed!.version,
      latestBuildId,
      server.workingDirectory
    )
    setJobId(id)
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
        title="Build instalada actualmente"
      >
        build {installed.buildId}
      </span>

      {latestBuildId ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-6 gap-1 px-2 text-[11px] text-accent hover:text-accent"
          disabled={updating}
          onClick={handleUpdate}
        >
          {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Build {latestBuildId} disponible · Actualizar
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          disabled={checking}
          title="Comprobar si hay una build más reciente"
          onClick={handleCheck}
        >
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  )
}
