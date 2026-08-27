import { useEffect, useState } from 'react'
import { Loader2, Map as MapIcon, Play, RefreshCw, RotateCw, Save, Settings, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { useServerStore } from '@renderer/store/serverStore'
import { cn, formatBytes } from '@renderer/lib/utils'
import type { MapRenderScheduleHours, MapStatus, ServerConfig } from '@shared/types'

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

  if (server.flavor === 'vanilla') {
    return <VanillaMapPanel server={server} status={status} onRefresh={refreshStatus} />
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

const RENDER_SCHEDULE_OPTIONS: { value: string; label: string; hours: MapRenderScheduleHours }[] = [
  { value: 'off', label: 'Desactivado', hours: null },
  { value: '6', label: 'Cada 6 horas', hours: 6 },
  { value: '12', label: 'Cada 12 horas', hours: 12 },
  { value: '24', label: 'Cada día', hours: 24 },
  { value: '48', label: 'Cada 2 días', hours: 48 },
  { value: '168', label: 'Cada semana', hours: 168 }
]

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

/** Vanilla servers can't run a plugin/mod, so the map comes from BlueMap's standalone CLI
 * instead — downloaded from GitHub, run on-demand or on a schedule. Kept fully separate
 * from the plugin-path state above (own install-progress tracking, own phases) rather than
 * cross-wiring the two, since this file already had one real bug from state that shouldn't
 * have interfered with something else (the inactive-tab-visibility issue fixed this session). */
function VanillaMapPanel({
  server,
  status,
  onRefresh
}: {
  server: ServerConfig
  status: MapStatus
  onRefresh: () => Promise<void>
}): JSX.Element {
  const updateServer = useServerStore((s) => s.updateServer)

  const [worldPathInput, setWorldPathInput] = useState(server.mapRender.worldPath)
  const [worldPathPlaceholder, setWorldPathPlaceholder] = useState('world')
  const [scheduleValue, setScheduleValue] = useState(
    RENDER_SCHEDULE_OPTIONS.find((o) => o.hours === server.mapRender.scheduleHours)?.value ?? 'off'
  )
  const [savingConfig, setSavingConfig] = useState(false)

  const [cliInstallJobId, setCliInstallJobId] = useState<string | null>(null)
  const [cliInstallProgress, setCliInstallProgress] = useState<{ downloaded: number; total: number | null } | null>(null)
  const [cliInstallError, setCliInstallError] = useState<string | null>(null)

  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  const [mapUrl, setMapUrl] = useState<string | null>(null)
  const [diskBytes, setDiskBytes] = useState<number | null>(null)
  const [diskLoading, setDiskLoading] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (worldPathInput === '') {
      window.launcher.map.cliResolveWorldPath(server.id).then(setWorldPathPlaceholder)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id])

  useEffect(() => {
    const offProgress = window.launcher.events.onMapCliProgress((p) => {
      if (p.jobId !== cliInstallJobId) return
      setCliInstallProgress({ downloaded: p.downloadedBytes, total: p.totalBytes })
    })
    const offDone = window.launcher.events.onMapCliDone((r) => {
      if (r.jobId !== cliInstallJobId) return
      setCliInstallJobId(null)
      setCliInstallProgress(null)
      if (!r.success) setCliInstallError(r.error)
      void onRefresh()
    })
    return () => {
      offProgress()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliInstallJobId])

  useEffect(() => {
    if (status.phase !== 'ready') {
      setMapUrl(null)
      return
    }
    window.launcher.map.getUrl(server.id).then(setMapUrl)
    void loadDiskUsage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.phase, server.id])

  useEffect(() => {
    if (!status.rendering || !status.renderStartedAt) {
      setElapsedSeconds(0)
      return
    }
    const startedAt = new Date(status.renderStartedAt).getTime()
    const tick = (): void => setElapsedSeconds(Math.max(0, Math.round((Date.now() - startedAt) / 1000)))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [status.rendering, status.renderStartedAt])

  async function loadDiskUsage(): Promise<void> {
    setDiskLoading(true)
    try {
      setDiskBytes(await window.launcher.map.getDiskUsage(server.id))
    } finally {
      setDiskLoading(false)
    }
  }

  const configDirty =
    worldPathInput !== server.mapRender.worldPath ||
    scheduleValue !== (RENDER_SCHEDULE_OPTIONS.find((o) => o.hours === server.mapRender.scheduleHours)?.value ?? 'off')

  async function handleSaveConfig(): Promise<void> {
    setSavingConfig(true)
    try {
      const hours = RENDER_SCHEDULE_OPTIONS.find((o) => o.value === scheduleValue)?.hours ?? null
      await updateServer({ ...server, mapRender: { worldPath: worldPathInput.trim(), scheduleHours: hours } })
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleCliInstall(): Promise<void> {
    setCliInstallError(null)
    const jobId = await window.launcher.map.cliInstall(server.id)
    setCliInstallJobId(jobId)
    setCliInstallProgress({ downloaded: 0, total: null })
  }

  async function handlePrepareConfig(): Promise<void> {
    setPreparing(true)
    setPrepareError(null)
    try {
      await window.launcher.map.cliPrepareConfig(server.id)
      await onRefresh()
    } catch (e) {
      setPrepareError((e as Error).message)
    } finally {
      setPreparing(false)
    }
  }

  async function handleRenderNow(): Promise<void> {
    setRenderError(null)
    try {
      await window.launcher.map.cliRenderNow(server.id)
      await onRefresh()
    } catch (e) {
      setRenderError((e as Error).message)
    }
  }

  async function handleCancelRender(): Promise<void> {
    await window.launcher.map.cliCancelRender(server.id)
    await onRefresh()
  }

  async function handlePurge(): Promise<void> {
    await window.launcher.map.purge(server.id)
    await onRefresh()
  }

  const configDialog = (
    <Dialog open={configOpen} onOpenChange={setConfigOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configuración del mapa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ruta del mundo (overworld)</Label>
            <Input value={worldPathInput} onChange={(e) => setWorldPathInput(e.target.value)} placeholder={worldPathPlaceholder} />
            <p className="text-[11px] text-muted-foreground">
              Relativa a la carpeta del servidor. Vacío = detectar automáticamente ({worldPathPlaceholder}).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Renderizado automático</Label>
            <Select value={scheduleValue} onValueChange={setScheduleValue}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RENDER_SCHEDULE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button className="gap-1.5" disabled={!configDirty || savingConfig} onClick={handleSaveConfig}>
            <Save className="h-3.5 w-3.5" /> {savingConfig ? 'Guardando...' : 'Guardar configuración'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const settingsButton = (
    <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => setConfigOpen(true)}>
      <Settings className="h-3.5 w-3.5" /> Configurar mapa
    </Button>
  )

  const toolbar = (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-1.5">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {status.phase === 'ready' && (
          <>
            <span>{diskLoading ? 'Calculando tamaño...' : diskBytes !== null ? `${formatBytes(diskBytes)} en disco` : ''}</span>
            {status.lastRenderedAt && <span>Último render: {new Date(status.lastRenderedAt).toLocaleString()}</span>}
            {status.lastRenderStatus === 'error' && <span className="text-destructive">El último render falló</span>}
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {status.phase === 'ready' &&
          (status.rendering ? (
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleCancelRender}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cancelar
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={handleRenderNow}>
              <RefreshCw className="h-3.5 w-3.5" /> Renderizar ahora
            </Button>
          ))}
        {status.phase === 'ready' && (
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={loadDiskUsage} disabled={diskLoading}>
            <RefreshCw className={cn('h-3.5 w-3.5', diskLoading && 'animate-spin')} /> Actualizar
          </Button>
        )}
        {status.phase === 'ready' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmPurge(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Purgar mapa
          </Button>
        )}
        {settingsButton}
      </div>
    </div>
  )

  let content: React.ReactNode

  if (cliInstallJobId) {
    const pct =
      cliInstallProgress?.total && cliInstallProgress.total > 0
        ? Math.min(100, Math.round((cliInstallProgress.downloaded / cliInstallProgress.total) * 100))
        : null
    content = (
      <EmptyState icon={<Loader2 className="h-8 w-8 animate-spin" />} title="Instalando BlueMap CLI...">
        <div className="mt-3 w-64">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: pct !== null ? `${pct}%` : '30%' }} />
          </div>
        </div>
      </EmptyState>
    )
  } else if (status.phase === 'cli-not-installed') {
    content = (
      <EmptyState icon={<MapIcon className="h-8 w-8" />} title="BlueMap CLI no instalado">
        <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
          Los servidores vanilla no pueden usar el plugin de BlueMap — el mapa se genera con su herramienta de línea de
          comandos en su lugar.
        </p>
        {cliInstallError && <p className="mt-2 text-sm text-destructive">{cliInstallError}</p>}
        <Button className="mt-4" onClick={handleCliInstall}>
          Instalar BlueMap CLI
        </Button>
      </EmptyState>
    )
  } else if (status.phase === 'java-incompatible') {
    content = (
      <EmptyState icon={<MapIcon className="h-8 w-8 text-destructive" />} title="Java incompatible">
        <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
          BlueMap CLI necesita Java 25 o superior.{' '}
          {status.javaCheck?.raw ? `Java detectado: ${status.javaCheck.raw}.` : 'No se pudo detectar Java.'} Cámbialo desde
          la pestaña Configuración.
        </p>
        <Button className="mt-4" variant="outline" onClick={onRefresh}>
          Reintentar
        </Button>
      </EmptyState>
    )
  } else if (status.phase === 'cli-needs-config') {
    content = (
      <EmptyState icon={<MapIcon className="h-8 w-8" />} title="Falta preparar la configuración">
        <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
          Genera la configuración de BlueMap y localiza las carpetas del mundo.
        </p>
        {prepareError && <p className="mt-2 max-w-md text-center text-sm text-destructive">{prepareError}</p>}
        <Button className="mt-4" onClick={handlePrepareConfig} disabled={preparing}>
          {preparing ? 'Preparando...' : 'Preparar configuración'}
        </Button>
      </EmptyState>
    )
  } else if (status.phase === 'cli-ready') {
    content = (
      <EmptyState icon={<MapIcon className="h-8 w-8" />} title="Listo para renderizar">
        {status.worldsDetected.length > 0 && (
          <p className="mt-1 text-center text-sm text-muted-foreground">Mundos detectados: {status.worldsDetected.join(', ')}</p>
        )}
        {renderError && <p className="mt-2 text-sm text-destructive">{renderError}</p>}
        <Button className="mt-4" onClick={handleRenderNow}>
          Renderizar ahora
        </Button>
      </EmptyState>
    )
  } else if (status.phase === 'rendering') {
    content = (
      <EmptyState icon={<Loader2 className="h-8 w-8 animate-spin" />} title="Renderizando...">
        <p className="mt-1 text-sm text-muted-foreground">{formatElapsed(elapsedSeconds)}</p>
        <Button className="mt-4" variant="outline" onClick={handleCancelRender}>
          Cancelar
        </Button>
      </EmptyState>
    )
  } else if (status.phase === 'error') {
    content = (
      <EmptyState icon={<MapIcon className="h-8 w-8 text-destructive" />} title="Algo falló">
        <p className="mt-1 max-w-md text-center text-sm text-destructive">{status.error}</p>
        <Button className="mt-4" variant="outline" onClick={onRefresh}>
          Reintentar
        </Button>
      </EmptyState>
    )
  } else {
    // status.phase === 'ready'
    content = (
      <div className="h-full overflow-hidden rounded-lg border border-border">
        {mapUrl && <iframe src={mapUrl} title="Mapa" className="h-full w-full border-0" />}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2">
      {toolbar}
      <div className="min-h-0 flex-1">{content}</div>
      {configDialog}
      <ConfirmDialog
        open={confirmPurge}
        onOpenChange={setConfirmPurge}
        title="¿Purgar el mapa?"
        description="Se borrará el mapa renderizado. La configuración del CLI se conserva, así que solo hace falta darle a «Renderizar ahora» otra vez."
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
