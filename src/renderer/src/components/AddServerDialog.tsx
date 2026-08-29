import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Download, FileArchive, FolderOpen, FileCode2, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { DownloadMinecraftServerDialog } from '@renderer/components/DownloadMinecraftServerDialog'
import { cn } from '@renderer/lib/utils'
import { useServerStore } from '@renderer/store/serverStore'
import {
  DEFAULT_BACKUP_CONFIG,
  DEFAULT_CONFIG_FILE_PATH,
  DEFAULT_MAP_RENDER_CONFIG,
  DEFAULT_PLAYER_LIST_FILES,
  DEFAULT_UPDATE_CHECK_CONFIG,
  FLAVOR_LABELS,
  MINECRAFT_DEFAULT_PORT
} from '@shared/types'
import type { DownloadResult, InstalledBuildInfo, JavaVersionCheck, LaunchMode, ServerFlavor } from '@shared/types'

interface AddServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
}

const STEPS = ['Básico', 'Lanzamiento', 'Revisión'] as const

export function AddServerDialog({ open, onOpenChange, onCreated }: AddServerDialogProps): JSX.Element {
  const createServer = useServerStore((s) => s.createServer)

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)

  const [name, setName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [flavor, setFlavor] = useState<ServerFlavor>('other')
  const [installedBuild, setInstalledBuild] = useState<InstalledBuildInfo | null>(null)
  const [recommendedJava, setRecommendedJava] = useState<number | null>(null)
  const [launchMode, setLaunchMode] = useState<LaunchMode>('jar')
  const [executable, setExecutable] = useState('')
  const [args, setArgs] = useState('')
  const [javaPath, setJavaPath] = useState('java')
  const [minMemoryMb, setMinMemoryMb] = useState(1024)
  const [maxMemoryMb, setMaxMemoryMb] = useState(4096)
  const [extraArgs, setExtraArgs] = useState('')
  const [port, setPort] = useState('')
  const [autoRestart, setAutoRestart] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [autoDetected, setAutoDetected] = useState(false)
  const [javaCheck, setJavaCheck] = useState<JavaVersionCheck | null>(null)
  const [checkingJava, setCheckingJava] = useState(false)
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false)

  const stepValid = [Boolean(name.trim() && workingDirectory.trim()), Boolean(executable.trim()), true]
  const furthestValid = stepValid.findIndex((v) => !v)
  const maxReachableStep = furthestValid === -1 ? STEPS.length - 1 : furthestValid

  async function pickDirectory(): Promise<void> {
    const dir = await window.launcher.dialogs.pickDirectory()
    if (!dir) return
    setWorkingDirectory(dir)
    setAutoDetected(false)

    setDetecting(true)
    try {
      const jar = await window.launcher.system.detectServerJar(dir)
      if (jar) {
        setLaunchMode('jar')
        setExecutable(jar)
        setAutoDetected(true)
      }
    } finally {
      setDetecting(false)
    }
  }

  function handleDownloadFinished(result: DownloadResult): void {
    setWorkingDirectory(result.destDir)
    setLaunchMode(result.launchMode)
    setExecutable(result.executable)
    // Forge/NeoForge run through run.bat, which forwards its own args to java —
    // it needs "nogui" passed the same way a jar launch does.
    setArgs(result.launchMode === 'command' ? 'nogui' : '')
    setAutoDetected(true)
    if (result.installedBuild) {
      setFlavor(result.installedBuild.flavor)
      setInstalledBuild(result.installedBuild)
    }
    setRecommendedJava(result.javaMajorVersion)
  }

  async function importZip(): Promise<void> {
    const zipPath = await window.launcher.dialogs.pickFile([{ name: 'Archivo ZIP', extensions: ['zip'] }])
    if (!zipPath) return
    const dir = await window.launcher.dialogs.pickDirectory()
    if (!dir) return

    setDetecting(true)
    try {
      const result = await window.launcher.system.importServerZip(zipPath, dir)
      setWorkingDirectory(result.destDir)
      setAutoDetected(false)
      if (result.executable) {
        setLaunchMode('jar')
        setExecutable(result.executable)
        setAutoDetected(true)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDetecting(false)
    }
  }

  async function runJavaCheck(path: string): Promise<void> {
    setCheckingJava(true)
    try {
      setJavaCheck(await window.launcher.system.checkJavaVersion(path.trim() || 'java'))
    } finally {
      setCheckingJava(false)
    }
  }

  useEffect(() => {
    if (step === 1 && launchMode === 'jar' && !javaCheck && !checkingJava) {
      void runJavaCheck(javaPath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, launchMode])

  useEffect(() => {
    if (!open) return
    window.launcher.servers.nextAvailablePort().then((next) => {
      if (next) setPort(String(next))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function pickExecutable(): Promise<void> {
    const filters =
      launchMode === 'jar'
        ? [{ name: 'Java Archive', extensions: ['jar'] }]
        : [{ name: 'Ejecutables', extensions: ['exe', 'bat', 'sh', 'cmd', '*'] }]
    const file = await window.launcher.dialogs.pickFile(filters)
    if (file) setExecutable(file)
  }

  function resetForm(): void {
    setStep(0)
    setDirection(1)
    setName('')
    setWorkingDirectory('')
    setFlavor('other')
    setInstalledBuild(null)
    setRecommendedJava(null)
    setLaunchMode('jar')
    setExecutable('')
    setArgs('')
    setJavaPath('java')
    setMinMemoryMb(1024)
    setMaxMemoryMb(4096)
    setExtraArgs('')
    setPort('')
    setAutoRestart(false)
    setError(null)
    setDetecting(false)
    setAutoDetected(false)
    setJavaCheck(null)
    setCheckingJava(false)
  }

  function goTo(next: number): void {
    if (next < 0 || next > STEPS.length - 1) return
    if (next > step && !stepValid[step]) return
    if (next > maxReachableStep) return
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  async function handleSubmit(): Promise<void> {
    if (!stepValid[0] || !stepValid[1]) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createServer({
        name: name.trim(),
        workingDirectory: workingDirectory.trim(),
        launchMode,
        executable: executable.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
        java: {
          javaPath: javaPath.trim() || 'java',
          minMemoryMb: Number(minMemoryMb) || 0,
          maxMemoryMb: Number(maxMemoryMb) || 0,
          extraArgs
        },
        port: port.trim() ? Number(port) : MINECRAFT_DEFAULT_PORT,
        autoRestart,
        flavor,
        installedBuild,
        configFilePath: DEFAULT_CONFIG_FILE_PATH,
        playerListFiles: DEFAULT_PLAYER_LIST_FILES,
        backup: DEFAULT_BACKUP_CONFIG,
        updateCheck: DEFAULT_UPDATE_CHECK_CONFIG,
        mapRender: DEFAULT_MAP_RENDER_CONFIG
      })
      resetForm()
      onOpenChange(false)
      onCreated(created.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const isLastStep = step === STEPS.length - 1

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) resetForm()
      }}
    >
      <DialogContent className="max-w-xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Añadir servidor</DialogTitle>
          <DialogDescription>
            Configura cómo se lanza tu servidor de Minecraft. Puedes ajustar esto luego desde los ajustes del
            servidor.
          </DialogDescription>
        </DialogHeader>

        <StepRail steps={STEPS} current={step} maxReachable={maxReachableStep} onSelect={goTo} />

        <div className="relative min-h-[340px] overflow-hidden">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={step}
              custom={direction}
              initial={{ x: direction > 0 ? 32 : -32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction > 0 ? -32 : 32, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="max-h-[52vh] space-y-4 overflow-y-auto scrollbar-thin pr-1"
            >
              {step === 0 && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Nombre</Label>
                    <Input
                      id="name"
                      autoFocus
                      placeholder="Mi servidor de Minecraft"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <Button
                    type="button"
                    className="w-full gap-1.5"
                    onClick={() => setDownloadDialogOpen(true)}
                  >
                    <Download className="h-4 w-4" /> Descargar servidor de Minecraft ahora
                  </Button>

                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] text-muted-foreground">o</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <Button type="button" variant="outline" className="w-full gap-1.5" onClick={importZip}>
                    <FileArchive className="h-4 w-4" /> Importar desde .zip
                  </Button>
                  {error && <p className="text-[11px] text-destructive">{error}</p>}

                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] text-muted-foreground">o usa uno que ya tengas</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cwd">Directorio de trabajo</Label>
                    <div className="flex gap-2">
                      <Input
                        id="cwd"
                        placeholder="C:\\Servers\\survival"
                        value={workingDirectory}
                        onChange={(e) => {
                          setWorkingDirectory(e.target.value)
                          setAutoDetected(false)
                        }}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={pickDirectory} title="Elegir carpeta">
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Si dentro hay un único .jar, lo detectamos y lo rellenamos por ti.
                    </p>
                    {detecting && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Buscando .jar...
                      </p>
                    )}
                    {autoDetected && !detecting && (
                      <p className="flex items-center gap-1.5 text-[11px] text-success">
                        <Sparkles className="h-3.5 w-3.5" /> Servidor detectado — lanzamiento rellenado
                        automáticamente.
                      </p>
                    )}
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Software</Label>
                      <Select value={flavor} onValueChange={(v) => setFlavor(v as ServerFlavor)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FLAVOR_LABELS) as ServerFlavor[]).map((f) => (
                            <SelectItem key={f} value={f}>
                              {FLAVOR_LABELS[f]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Modo de lanzamiento</Label>
                      <Select value={launchMode} onValueChange={(v) => setLaunchMode(v as LaunchMode)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="jar">Archivo .jar (vía Java)</SelectItem>
                          <SelectItem value="command">Comando / ejecutable personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="executable">
                      {launchMode === 'jar' ? 'Archivo .jar del servidor' : 'Ejecutable'}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="executable"
                        placeholder={launchMode === 'jar' ? 'paper.jar' : 'start.sh'}
                        value={executable}
                        onChange={(e) => setExecutable(e.target.value)}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={pickExecutable} title="Elegir archivo">
                        <FileCode2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="args">Argumentos de lanzamiento (opcional)</Label>
                    <Input
                      id="args"
                      placeholder="ej. --world otro_mundo"
                      value={args}
                      onChange={(e) => setArgs(e.target.value)}
                    />
                    {launchMode === 'jar' && (
                      <p className="text-[11px] text-muted-foreground">
                        "nogui" se añade automáticamente para que la consola se quede dentro del launcher.
                      </p>
                    )}
                  </div>

                  {launchMode === 'jar' && (
                    <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Runtime de Java
                        {recommendedJava && ` · esta versión recomienda Java ${recommendedJava}+`}
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="javaPath">Ejecutable de Java</Label>
                        <Input
                          id="javaPath"
                          value={javaPath}
                          onChange={(e) => setJavaPath(e.target.value)}
                          onBlur={(e) => runJavaCheck(e.target.value)}
                        />
                        <JavaCheckStatus checking={checkingJava} result={javaCheck} recommended={recommendedJava} />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="minMem">Memoria mínima (MB)</Label>
                          <Input
                            id="minMem"
                            type="number"
                            value={minMemoryMb}
                            onChange={(e) => setMinMemoryMb(Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="maxMem">Memoria máxima (MB)</Label>
                          <Input
                            id="maxMem"
                            type="number"
                            value={maxMemoryMb}
                            onChange={(e) => setMaxMemoryMb(Number(e.target.value))}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="extraArgs">Argumentos JVM adicionales</Label>
                        <Input
                          id="extraArgs"
                          placeholder="-XX:+UseG1GC"
                          value={extraArgs}
                          onChange={(e) => setExtraArgs(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="port">Puerto</Label>
                      <Input
                        id="port"
                        type="number"
                        placeholder={String(MINECRAFT_DEFAULT_PORT)}
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3">
                      <Label htmlFor="autoRestart" className="cursor-pointer">
                        Auto-reinicio
                      </Label>
                      <Switch id="autoRestart" checked={autoRestart} onCheckedChange={setAutoRestart} />
                    </div>
                  </div>

                  <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resumen</p>
                    <SummaryRow label="Nombre" value={name} />
                    <SummaryRow label="Software" value={FLAVOR_LABELS[flavor]} />
                    <SummaryRow label="Directorio" value={workingDirectory} mono />
                    <SummaryRow
                      label="Lanzamiento"
                      value={launchMode === 'jar' ? `Java · ${executable}` : executable}
                      mono
                    />
                    {args.trim() && <SummaryRow label="Argumentos" value={args} mono />}
                    <SummaryRow label="Puerto" value={port.trim() || String(MINECRAFT_DEFAULT_PORT)} />
                    <SummaryRow label="Auto-reinicio" value={autoRestart ? 'Activado' : 'Desactivado'} />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button variant="outline" onClick={() => (step === 0 ? onOpenChange(false) : goTo(step - 1))}>
            {step === 0 ? (
              'Cancelar'
            ) : (
              <>
                <ChevronLeft className="mr-1 h-4 w-4" /> Atrás
              </>
            )}
          </Button>
          {isLastStep ? (
            <Button disabled={!stepValid[0] || !stepValid[1] || submitting} onClick={handleSubmit}>
              {submitting ? 'Creando...' : 'Crear servidor'}
            </Button>
          ) : (
            <Button disabled={!stepValid[step]} onClick={() => goTo(step + 1)}>
              Siguiente <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>

      <DownloadMinecraftServerDialog
        open={downloadDialogOpen}
        onOpenChange={setDownloadDialogOpen}
        onFinished={handleDownloadFinished}
      />
    </Dialog>
  )
}

function StepRail({
  steps,
  current,
  maxReachable,
  onSelect
}: {
  steps: readonly string[]
  current: number
  maxReachable: number
  onSelect: (index: number) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 py-1">
      {steps.map((label, i) => {
        const reachable = i <= maxReachable
        const state = i < current ? 'done' : i === current ? 'active' : 'upcoming'
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onSelect(i)}
              className={cn(
                'flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-medium transition-colors',
                reachable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                state === 'active' && 'text-foreground',
                state !== 'active' && 'text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                  state === 'done' && 'border-primary bg-primary text-primary-foreground',
                  state === 'active' && 'border-primary text-primary',
                  state === 'upcoming' && 'border-border text-muted-foreground'
                )}
              >
                {state === 'done' ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < steps.length - 1 && (
              <div className="h-px flex-1 bg-border">
                <motion.div
                  className="h-px bg-primary"
                  initial={false}
                  animate={{ width: i < current ? '100%' : '0%' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('truncate text-right text-foreground', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function JavaCheckStatus({
  checking,
  result,
  recommended
}: {
  checking: boolean
  result: JavaVersionCheck | null
  recommended: number | null
}): JSX.Element | null {
  if (checking) {
    return <p className="text-[11px] text-muted-foreground">Comprobando versión de Java...</p>
  }
  if (!result) return null
  if (!result.available) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-warning">
        No se encontró ese ejecutable de Java en el sistema.
      </p>
    )
  }
  const belowRecommended = recommended !== null && result.majorVersion !== null && result.majorVersion < recommended
  return (
    <p className={cn('flex items-center gap-1.5 text-[11px]', belowRecommended ? 'text-warning' : 'text-success')}>
      <Check className="h-3 w-3" /> {result.raw ?? `Java ${result.majorVersion}`} detectado
      {belowRecommended && ` — se recomienda Java ${recommended}+ para esta versión`}
    </p>
  )
}
