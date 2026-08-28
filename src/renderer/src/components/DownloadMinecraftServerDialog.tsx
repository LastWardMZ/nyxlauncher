import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import { FolderOpen, Loader2, CheckCircle2, XCircle, Download, Box } from 'lucide-react'
import type { DownloadResult, MinecraftBuildOption, MinecraftVersionOption, ServerCategory, ServerFlavor } from '@shared/types'

const CATEGORY_LABELS: Record<ServerCategory, string> = {
  server: 'Minecraft servers',
  proxy: 'Minecraft proxies'
}

const FLAVORS: { value: ServerFlavor; category: ServerCategory; label: string; description: string }[] = [
  { value: 'vanilla', category: 'server', label: 'Vanilla', description: 'El servidor oficial de Mojang, sin plugins ni mods.' },
  { value: 'paper', category: 'server', label: 'Paper', description: 'El más popular: rápido, con muchos plugins.' },
  { value: 'purpur', category: 'server', label: 'Purpur', description: 'Fork de Paper con más opciones de configuración.' },
  { value: 'folia', category: 'server', label: 'Folia', description: 'Fork de Paper con regiones multi-hilo para mapas enormes.' },
  { value: 'fabric', category: 'server', label: 'Fabric', description: 'Ligero y modular — el estándar para mods ligeros.' },
  { value: 'forge', category: 'server', label: 'Forge', description: 'El modding tradicional para Minecraft, vía instalador.' },
  { value: 'neoforge', category: 'server', label: 'NeoForge', description: 'Fork moderno de Forge, vía instalador.' },
  { value: 'velocity', category: 'proxy', label: 'Velocity', description: 'Proxy moderno para conectar varios servidores.' },
  { value: 'bungeecord', category: 'proxy', label: 'BungeeCord', description: 'El proxy clásico de Spigot/md_5.' }
]

interface DownloadMinecraftServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onFinished: (result: DownloadResult) => void
}

type Phase = 'form' | 'downloading' | 'success' | 'error'

export function DownloadMinecraftServerDialog({
  open,
  onOpenChange,
  onFinished
}: DownloadMinecraftServerDialogProps): JSX.Element {
  const [category, setCategory] = useState<ServerCategory>('server')
  const [flavor, setFlavor] = useState<ServerFlavor>('paper')
  const [versions, setVersions] = useState<MinecraftVersionOption[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [version, setVersion] = useState('')
  const [builds, setBuilds] = useState<MinecraftBuildOption[]>([])
  const [loadingBuilds, setLoadingBuilds] = useState(false)
  const [buildId, setBuildId] = useState('')
  const [destDir, setDestDir] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>('form')
  const [jobId, setJobId] = useState<string | null>(null)
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  const [result, setResult] = useState<DownloadResult | null>(null)

  useEffect(() => {
    if (!open) return
    resetAll()
  }, [open])

  useEffect(() => {
    if (!open) return
    setVersions([])
    setVersion('')
    setLoadingVersions(true)
    window.launcher.minecraft
      .listVersions(flavor)
      .then((v) => setVersions(v))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingVersions(false))
  }, [flavor, open])

  useEffect(() => {
    if (!version) {
      setBuilds([])
      setBuildId('')
      return
    }
    setLoadingBuilds(true)
    window.launcher.minecraft
      .listBuilds(flavor, version)
      .then((b) => {
        setBuilds(b)
        setBuildId(b[0]?.id ?? '')
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingBuilds(false))
  }, [flavor, version])

  useEffect(() => {
    const offProgress = window.launcher.events.onDownloadProgress((p) => {
      if (p.jobId !== jobId) return
      setDownloadedBytes(p.downloadedBytes)
      setTotalBytes(p.totalBytes)
    })
    const offDone = window.launcher.events.onDownloadDone((r) => {
      if (r.jobId !== jobId) return
      setResult(r)
      setPhase(r.success ? 'success' : 'error')
      if (!r.success) setError(r.error)
    })
    return () => {
      offProgress()
      offDone()
    }
  }, [jobId])

  function resetAll(): void {
    setPhase('form')
    setJobId(null)
    setDownloadedBytes(0)
    setTotalBytes(null)
    setResult(null)
    setError(null)
    setDestDir('')
  }

  function handleCategoryChange(next: ServerCategory): void {
    setCategory(next)
    setFlavor(FLAVORS.find((f) => f.category === next)?.value ?? flavor)
  }

  async function pickDestDir(): Promise<void> {
    const dir = await window.launcher.dialogs.pickDirectory()
    if (dir) setDestDir(dir)
  }

  async function handleStart(): Promise<void> {
    if (!version || !buildId || !destDir.trim()) return
    setError(null)
    setPhase('downloading')
    const id = await window.launcher.minecraft.download(flavor, version, buildId, destDir.trim())
    setJobId(id)
  }

  function handleCancel(): void {
    if (jobId) window.launcher.minecraft.cancelDownload(jobId)
    setPhase('form')
  }

  function handleClose(): void {
    if (phase === 'downloading' && jobId) window.launcher.minecraft.cancelDownload(jobId)
    onOpenChange(false)
    resetAll()
  }

  function handleUse(): void {
    if (!result) return
    onFinished(result)
    onOpenChange(false)
    resetAll()
  }

  const groups = [...new Set(versions.map((v) => v.group))]
  const progressPct = totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4.5 w-4.5" /> Descargar servidor de Minecraft
          </DialogTitle>
          <DialogDescription>
            Paper, Fabric, Forge y compañía publican sus builds en APIs públicas — sin cuenta ni herramientas
            externas. Elige tipo, versión y build, y el launcher se encarga del resto.
          </DialogDescription>
        </DialogHeader>

        {phase === 'form' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo de servidor</Label>
              <Select value={category} onValueChange={(v) => handleCategoryChange(v as ServerCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as ServerCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {FLAVORS.filter((f) => f.category === category).map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFlavor(f.value)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                    flavor === f.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border/60 hover:border-border hover:bg-muted/30'
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Box className="h-3.5 w-3.5" /> {f.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{f.description}</span>
                </button>
              ))}
            </div>

            {(flavor === 'forge' || flavor === 'neoforge') && (
              <p className="text-[11px] text-muted-foreground">
                {FLAVORS.find((f) => f.value === flavor)?.label} se distribuye como instalador — el launcher lo
                descarga y lo ejecuta por ti, así que esta descarga tarda algo más que las demás.
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Versión</Label>
                <Select value={version} onValueChange={setVersion} disabled={loadingVersions || versions.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingVersions ? 'Cargando...' : 'Elige versión'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {groups.map((group) => (
                      <div key={group}>
                        {versions
                          .filter((v) => v.group === group)
                          .map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.id}
                            </SelectItem>
                          ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Build</Label>
                <Select value={buildId} onValueChange={setBuildId} disabled={loadingBuilds || builds.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingBuilds ? 'Cargando...' : 'Última'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {builds.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        #{b.id} {b.channel !== 'UNKNOWN' && `· ${b.channel}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Carpeta de destino</Label>
              <div className="flex gap-2">
                <Input value={destDir} onChange={(e) => setDestDir(e.target.value)} placeholder="C:\Servers\survival" />
                <Button variant="outline" size="icon" onClick={pickDestDir} title="Elegir carpeta">
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {(phase === 'downloading' || phase === 'success' || phase === 'error') && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/10 p-4">
              {phase === 'downloading' && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {progressPct === 100 && (flavor === 'forge' || flavor === 'neoforge')
                      ? 'Ejecutando el instalador...'
                      : `Descargando ${FLAVORS.find((f) => f.value === flavor)?.label} ${version}${progressPct !== null ? ` — ${progressPct}%` : '...'}`}
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: progressPct !== null ? `${progressPct}%` : '30%' }}
                    />
                  </div>
                  {totalBytes && (
                    <p className="text-[11px] text-muted-foreground">
                      {(downloadedBytes / 1024 / 1024).toFixed(1)} MB / {(totalBytes / 1024 / 1024).toFixed(1)} MB
                    </p>
                  )}
                </div>
              )}
              {phase === 'success' && result && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Descarga completa.
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{result.executable}</p>
                  {result.javaMajorVersion && (
                    <Badge variant="secondary" className="mt-1">
                      Requiere Java {result.javaMajorVersion}+
                    </Badge>
                  )}
                </div>
              )}
              {phase === 'error' && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <XCircle className="h-3.5 w-3.5" /> {error ?? 'La descarga falló.'}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {phase === 'form' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button disabled={!version || !buildId || !destDir.trim()} onClick={handleStart} className="gap-1.5">
                <Download className="h-4 w-4" /> Descargar
              </Button>
            </>
          ) : phase === 'downloading' ? (
            <Button variant="outline" onClick={handleCancel}>
              Cancelar descarga
            </Button>
          ) : phase === 'success' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cerrar
              </Button>
              <Button onClick={handleUse}>Usar este servidor</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cerrar
              </Button>
              <Button onClick={() => setPhase('form')}>Reintentar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
