import { useEffect, useState } from 'react'
import { Loader2, Map as MapIcon, Play, RefreshCw, RotateCw, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { useServerStore } from '@renderer/store/serverStore'
import { cn, formatBytes } from '@renderer/lib/utils'
import type { MapStatus, ServerConfig } from '@shared/types'

const STATUS_POLL_MS = 5000

export function MapTab({ server }: { server: ServerConfig }): JSX.Element {
  const startServer = useServerStore((s) => s.startServer)
  const restartServer = useServerStore((s) => s.restartServer)

  const [status, setStatus] = useState<MapStatus | null>(null)
  const [installJobId, setInstallJobId] = useState<string | null>(null)
  const [installProgress, setInstallProgress] = useState<{ downloaded: number; total: number | null } | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)
  const [confirmActivate, setConfirmActivate] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [mapUrl, setMapUrl] = useState<string | null>(null)
  const [diskBytes, setDiskBytes] = useState<number | null>(null)
  const [diskLoading, setDiskLoading] = useState(false)

  async function refreshStatus(): Promise<void> {
    setStatus(await window.launcher.map.getStatus(server.id))
  }

  useEffect(() => {
    void refreshStatus()
    const interval = setInterval(() => void refreshStatus(), STATUS_POLL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id])

  useEffect(() => {
    const offProgress = window.launcher.events.onContentProgress((p) => {
      if (p.jobId !== installJobId) return
      setInstallProgress({ downloaded: p.downloadedBytes, total: p.totalBytes })
    })
    const offDone = window.launcher.events.onContentDone((r) => {
      if (r.jobId !== installJobId) return
      setInstallJobId(null)
      setInstallProgress(null)
      if (!r.success) setInstallError(r.error)
      void refreshStatus()
    })
    return () => {
      offProgress()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installJobId])

  useEffect(() => {
    if (status?.phase !== 'ready') {
      setMapUrl(null)
      return
    }
    window.launcher.map.getUrl(server.id).then(setMapUrl)
    void loadDiskUsage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.phase, server.id])

  async function loadDiskUsage(): Promise<void> {
    setDiskLoading(true)
    try {
      setDiskBytes(await window.launcher.map.getDiskUsage(server.id))
    } finally {
      setDiskLoading(false)
    }
  }

  async function handleInstall(): Promise<void> {
    setInstallError(null)
    const jobId = await window.launcher.map.install(server.id)
    setInstallJobId(jobId)
    setInstallProgress({ downloaded: 0, total: null })
  }

  async function handleActivate(): Promise<void> {
    setActivating(true)
    try {
      await window.launcher.map.activate(server.id)
      await refreshStatus()
    } finally {
      setActivating(false)
    }
  }

  async function handlePurge(): Promise<void> {
    await window.launcher.map.purge(server.id)
    await refreshStatus()
  }

  if (!status) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando...
      </div>
    )
  }

  if (installJobId) {
    const pct =
      installProgress?.total && installProgress.total > 0
        ? Math.min(100, Math.round((installProgress.downloaded / installProgress.total) * 100))
        : null
    return (
      <EmptyState icon={<Loader2 className="h-8 w-8 animate-spin" />} title="Instalando BlueMap...">
        <div className="mt-3 w-64">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: pct !== null ? `${pct}%` : '30%' }} />
          </div>
        </div>
      </EmptyState>
    )
  }

  if (status.phase === 'not-installed') {
    return (
      <EmptyState icon={<MapIcon className="h-8 w-8" />} title="Sin mapa instalado">
        <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
          BlueMap genera un mapa 3D interactivo del mundo del servidor, con vista 2D y 3D libre, directamente en el
          navegador.
        </p>
        {installError && <p className="mt-2 text-sm text-destructive">{installError}</p>}
        <Button className="mt-4" onClick={handleInstall}>
          Instalar BlueMap
        </Button>
      </EmptyState>
    )
  }

  if (status.phase === 'awaiting-first-boot') {
    return (
      <EmptyState icon={<MapIcon className="h-8 w-8" />} title="Falta iniciar el servidor una vez">
        <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
          BlueMap está instalado, pero genera su configuración la primera vez que el servidor arranca con el plugin
          puesto.
        </p>
        <Button className="mt-4 gap-1.5" onClick={() => (status.serverRunning ? restartServer(server.id) : startServer(server.id))}>
          {status.serverRunning ? <RotateCw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {status.serverRunning ? 'Reiniciar servidor' : 'Iniciar servidor'}
        </Button>
      </EmptyState>
    )
  }

  if (status.phase === 'needs-patch') {
    return (
      <EmptyState icon={<MapIcon className="h-8 w-8" />} title="Falta activar el mapa">
        <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
          BlueMap necesita permiso para descargar las texturas oficiales de Mojang, y hay que desactivar su servidor
          web interno para usar el del launcher en su lugar.
        </p>
        <Button className="mt-4" onClick={() => setConfirmActivate(true)} disabled={activating}>
          {activating ? 'Activando...' : 'Activar mapa'}
        </Button>
        <ConfirmDialog
          open={confirmActivate}
          onOpenChange={setConfirmActivate}
          title="¿Activar el mapa?"
          description='Se le dará permiso a BlueMap para descargar recursos oficiales de Mojang (texturas del juego) y se desactivará su servidor web interno.'
          confirmLabel="Activar"
          destructive={false}
          onConfirm={handleActivate}
        />
      </EmptyState>
    )
  }

  if (status.phase === 'error') {
    return (
      <EmptyState icon={<MapIcon className="h-8 w-8 text-destructive" />} title="Algo falló">
        <p className="mt-1 max-w-md text-center text-sm text-destructive">{status.error}</p>
        <Button className="mt-4" variant="outline" onClick={refreshStatus}>
          Reintentar
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-1.5">
        <p className="text-xs text-muted-foreground">
          {diskLoading ? 'Calculando tamaño...' : diskBytes !== null ? `${formatBytes(diskBytes)} en disco` : ''}
        </p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={loadDiskUsage} disabled={diskLoading}>
            <RefreshCw className={cn('h-3.5 w-3.5', diskLoading && 'animate-spin')} /> Actualizar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmPurge(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Purgar mapa
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        {mapUrl && <iframe src={mapUrl} title="Mapa" className="h-full w-full border-0" />}
      </div>
      <ConfirmDialog
        open={confirmPurge}
        onOpenChange={setConfirmPurge}
        title="¿Purgar el mapa?"
        description="Se borrará todo el mapa generado y su configuración. Tendrás que reiniciar el servidor y volver a activarlo para regenerarlo."
        confirmLabel="Purgar"
        destructive
        onConfirm={handlePurge}
      />
    </div>
  )
}

function EmptyState({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }): JSX.Element {
  return (
    <Card className="flex h-full flex-col items-center justify-center p-8">
      <CardHeader className="items-center p-0">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">{icon}</div>
        <CardTitle className="mt-3 text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center p-0">{children}</CardContent>
    </Card>
  )
}
