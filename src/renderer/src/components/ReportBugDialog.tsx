import { useEffect, useRef, useState } from 'react'
import { Bug, Copy, ExternalLink, Image as ImageIcon, Paperclip, X } from 'lucide-react'
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
import { Textarea } from '@renderer/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { isRemoteBrowser } from '@renderer/runtimeContext'

const REPO_URL = 'https://github.com/LastWardMZ/nyxlauncher'

// Values must match the option labels in .github/ISSUE_TEMPLATE/bug_report.yml
// exactly — GitHub prefills a dropdown by matching the option text.
const MODE_OPTIONS = [
  'Escritorio (instalador de Windows)',
  'Docker (VPS o NAS)',
  'Panel remoto — red local (LAN)',
  'Panel remoto — Tailscale',
  'Panel remoto — Cloudflare (acceso público)'
]

const OS_OPTIONS = ['Windows 11', 'Windows 10', 'Linux (Docker)', 'Otro']

function detectDefaultMode(): string {
  if (!isRemoteBrowser) return MODE_OPTIONS[0]
  const host = window.location.hostname
  if (host === 'localhost' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return MODE_OPTIONS[2]
  if (host.endsWith('.ts.net') || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return MODE_OPTIONS[3]
  return MODE_OPTIONS[4]
}

function detectDefaultOs(): string {
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'Windows 10'
  if (/Linux/i.test(ua)) return 'Linux (Docker)'
  return 'Otro'
}

function buildGithubUrl(fields: Record<string, string>): string {
  const params = new URLSearchParams({ template: 'bug_report.yml', labels: 'bug' })
  for (const [key, value] of Object.entries(fields)) {
    if (value.trim()) params.set(key, value)
  }
  return `${REPO_URL}/issues/new?${params.toString()}`
}

export function ReportBugDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element {
  const [version, setVersion] = useState('')
  const [title, setTitle] = useState('')
  const [whatHappened, setWhatHappened] = useState('')
  const [expected, setExpected] = useState('')
  const [steps, setSteps] = useState('')
  const [mode, setMode] = useState(MODE_OPTIONS[0])
  const [os, setOs] = useState(OS_OPTIONS[0])
  const [logs, setLogs] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [showRequiredError, setShowRequiredError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    window.launcher.app.getVersion().then(setVersion)
    setMode(detectDefaultMode())
    setOs(detectDefaultOs())
    setShowRequiredError(false)
  }, [open])

  function resetAndClose(): void {
    setTitle('')
    setWhatHappened('')
    setExpected('')
    setSteps('')
    setLogs('')
    setAttachment(null)
    setCopyState('idle')
    onOpenChange(false)
  }

  async function copyAttachmentToClipboard(): Promise<void> {
    if (!attachment) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ [attachment.type]: attachment })])
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  function evidenceHint(): string {
    if (!attachment) return ''
    if (attachment.type.startsWith('image/')) {
      return copyState === 'copied'
        ? 'He copiado una captura al portapapeles con NyxLauncher — pégala aquí con Ctrl+V.'
        : `Adjunta aquí la captura "${attachment.name}" (arrástrala o pégala).`
    }
    return `Arrastra aquí el vídeo "${attachment.name}" que has seleccionado en NyxLauncher.`
  }

  function handleSubmit(): void {
    if (!whatHappened.trim()) {
      setShowRequiredError(true)
      return
    }
    const url = buildGithubUrl({
      title: title.trim() ? `[BUG] ${title.trim()}` : '[BUG] ',
      'what-happened': whatHappened,
      expected,
      steps,
      mode,
      version,
      os,
      evidence: evidenceHint(),
      logs
    })
    window.open(url, '_blank')
    resetAndClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : resetAndClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4.5 w-4.5" /> Reportar un problema
          </DialogTitle>
          <DialogDescription>
            Rellena lo que puedas aquí — al enviar, se abrirá el formulario de GitHub ya rellenado para que lo
            revises y lo mandes con tu cuenta.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[28rem] space-y-3 overflow-y-auto scrollbar-thin px-1">
          <div className="space-y-1.5">
            <Label>Título breve</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ej. La consola se congela al reiniciar" />
          </div>

          <div className="space-y-1.5">
            <Label>¿Qué ha pasado? *</Label>
            <Textarea
              value={whatHappened}
              onChange={(e) => {
                setWhatHappened(e.target.value)
                if (e.target.value.trim()) setShowRequiredError(false)
              }}
              placeholder="Cuéntanos qué ha ocurrido con el mayor detalle posible."
              rows={3}
              className={showRequiredError ? 'border-destructive' : undefined}
              autoFocus
            />
            {showRequiredError && <p className="text-xs text-destructive">Cuéntanos qué ha pasado antes de continuar.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>¿Qué esperabas que pasara?</Label>
            <Textarea value={expected} onChange={(e) => setExpected(e.target.value)} rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label>Pasos para reproducirlo</Label>
            <Textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder={'1. ...\n2. ...\n3. ...'}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Modo de uso</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sistema operativo</Label>
              <Select value={os} onValueChange={setOs}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OS_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Versión de NyxLauncher</Label>
            <Input value={version} disabled placeholder="Detectando..." />
          </div>

          <div className="space-y-1.5">
            <Label>Captura o vídeo (opcional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(e) => {
                setAttachment(e.target.files?.[0] ?? null)
                setCopyState('idle')
              }}
            />
            {attachment ? (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs">{attachment.name}</span>
                {attachment.type.startsWith('image/') && (
                  <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={copyAttachmentToClipboard}>
                    <Copy className="h-3 w-3" /> {copyState === 'copied' ? 'Copiada' : 'Copiar'}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    setAttachment(null)
                    setCopyState('idle')
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-3.5 w-3.5" /> Elegir captura o vídeo
              </Button>
            )}
            {attachment?.type.startsWith('image/') && (
              <p className="text-[11px] text-muted-foreground">
                Cópiala al portapapeles y pégala directamente en el formulario de GitHub con Ctrl+V.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Logs (opcional)</Label>
            <Textarea
              value={logs}
              onChange={(e) => setLogs(e.target.value)}
              placeholder="Pega aquí la salida relevante de la consola, si la tienes."
              rows={2}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} className="gap-1.5">
            <ExternalLink className="h-4 w-4" /> Abrir en GitHub
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
