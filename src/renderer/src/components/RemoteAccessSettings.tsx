import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { DEFAULT_APP_SETTINGS } from '@shared/types'
import type { AppSettings, RemoteAccessProfile, RemoteServerStatus, RemoteSessionInfo, TailscaleStatus } from '@shared/types'

export function RemoteAccessSettings(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [accountConfigured, setAccountConfigured] = useState(false)
  const [serverStatus, setServerStatus] = useState<RemoteServerStatus>({ running: false, port: null, lanIp: null })
  const [sessions, setSessions] = useState<RemoteSessionInfo[]>([])
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [portInput, setPortInput] = useState('')
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus>({
    installed: false,
    connected: false,
    hostname: null,
    tailscaleIp: null,
    authUrl: null
  })

  async function refreshAll(): Promise<void> {
    const [s, auth, server, sess, ts] = await Promise.all([
      window.launcher.settings.get(),
      window.launcher.remoteAccess.getAuthStatus(),
      window.launcher.remoteAccess.getServerStatus(),
      window.launcher.remoteAccess.listSessions(),
      window.launcher.tailscale.getStatus()
    ])
    setSettings(s)
    setPortInput(String(s.remoteAccess.lanPort))
    setAccountConfigured(auth.accountConfigured)
    setServerStatus(server)
    setSessions(sess)
    setTailscaleStatus(ts)
    setLoaded(true)
  }

  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!serverStatus.running || !serverStatus.lanIp || !serverStatus.port) {
      setQrDataUrl(null)
      return
    }
    const url = `http://${serverStatus.lanIp}:${serverStatus.port}`
    QRCode.toDataURL(url, { margin: 1, width: 160 }).then(setQrDataUrl)
  }, [serverStatus])

  async function toggleLan(enabled: boolean): Promise<void> {
    const port = Number(portInput) || settings.remoteAccess.lanPort
    const next = { ...settings, remoteAccess: { ...settings.remoteAccess, lanEnabled: enabled, lanPort: port } }
    setSettings(next)
    try {
      await window.launcher.settings.update(next)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
      setSettings(settings)
      return
    }
    const server = await window.launcher.remoteAccess.getServerStatus()
    setServerStatus(server)
  }

  async function applyPort(): Promise<void> {
    if (!settings.remoteAccess.lanEnabled) return
    await toggleLan(true)
  }

  async function updateProfile(profile: RemoteAccessProfile): Promise<void> {
    const next = { ...settings, remoteAccess: { ...settings.remoteAccess, profile } }
    setSettings(next)
    try {
      await window.launcher.settings.update(next)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
      setSettings(settings)
    }
  }

  const lanUrl = serverStatus.running && serverStatus.lanIp ? `http://${serverStatus.lanIp}:${serverStatus.port}` : null

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Acceso remoto</CardTitle>
        <CardDescription>
          Abre el panel de NyxLauncher desde el navegador de otro dispositivo en tu red local.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border/60 px-3 py-2.5 text-sm">
          Estado:{' '}
          <span className="font-medium text-foreground">{statusLabel(settings, serverStatus, tailscaleStatus)}</span>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
          <div>
            <Label className="text-foreground">Permitir acceso desde la red local</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              El panel queda accesible desde cualquier dispositivo de tu WiFi/red, protegido por login.
            </p>
          </div>
          <Switch checked={settings.remoteAccess.lanEnabled} disabled={!loaded} onCheckedChange={toggleLan} />
        </div>

        <div className="flex items-end gap-2 rounded-md border border-border/60 px-3 py-2.5">
          <div className="flex-1">
            <Label htmlFor="lanPort" className="text-foreground">
              Puerto
            </Label>
            <Input
              id="lanPort"
              className="mt-1"
              value={portInput}
              onChange={(e) => setPortInput(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <Button size="sm" variant="outline" disabled={!settings.remoteAccess.lanEnabled} onClick={applyPort}>
            Aplicar puerto
          </Button>
        </div>

        {lanUrl && (
          <div className="flex items-center gap-4 rounded-md border border-border/60 px-3 py-3">
            {qrDataUrl && <img src={qrDataUrl} alt="Código QR de acceso" className="h-24 w-24 shrink-0 rounded" />}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">URL de acceso</p>
              <div className="flex items-center gap-2">
                <code className="truncate text-sm text-foreground">{lanUrl}</code>
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(lanUrl)}>
                  Copiar
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-md border border-border/60 px-3 py-2.5">
          <Label className="text-foreground">Acceso por internet</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Independiente del toggle de LAN — puedes tener los dos activos a la vez.
          </p>
          <Select
            value={settings.remoteAccess.profile}
            onValueChange={(v) => updateProfile(v as RemoteAccessProfile)}
            disabled={!loaded}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Desactivado</SelectItem>
              <SelectItem value="tailscale">Solo mis dispositivos (Tailscale)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {settings.remoteAccess.profile === 'tailscale' && (
          <TailscalePanel status={tailscaleStatus} onChanged={refreshAll} />
        )}

        <PasswordSection accountConfigured={accountConfigured} onChanged={refreshAll} />

        {sessions.length > 0 && (
          <div className="rounded-md border border-border/60 px-3 py-2.5">
            <p className="mb-2 text-sm font-medium text-foreground">Sesiones activas</p>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <div className="min-w-0 text-muted-foreground">
                    <span className="text-foreground">{s.ip}</span> · {s.userAgent.slice(0, 60)}
                    <br />
                    último acceso {new Date(s.lastSeenAt).toLocaleString()}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await window.launcher.remoteAccess.revokeSession(s.id)
                      refreshAll()
                    }}
                  >
                    Revocar
                  </Button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={async () => {
                await window.launcher.remoteAccess.revokeAllSessions()
                refreshAll()
              }}
            >
              Cerrar sesión en todos los dispositivos
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function statusLabel(settings: AppSettings, server: RemoteServerStatus, tailscale: TailscaleStatus): string {
  const lan = settings.remoteAccess.lanEnabled && server.running
  const ts = settings.remoteAccess.profile === 'tailscale' && tailscale.connected
  if (lan && ts) return 'LAN + Tailscale'
  if (ts) return 'Tailscale (solo tus dispositivos)'
  if (lan) return 'Solo LAN'
  return 'Desactivado'
}

function TailscalePanel({
  status,
  onChanged
}: {
  status: TailscaleStatus
  onChanged: () => void
}): JSX.Element {
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState<{ downloadedBytes: number; totalBytes: number | null } | null>(
    null
  )
  const [connecting, setConnecting] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [authQrDataUrl, setAuthQrDataUrl] = useState<string | null>(null)
  const [tsQrDataUrl, setTsQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return window.launcher.events.onTailscaleInstallProgress(setInstallProgress)
  }, [])

  useEffect(() => {
    return window.launcher.events.onTailscaleAuthUrl((url) => setAuthUrl(url))
  }, [])

  useEffect(() => {
    if (!authUrl) {
      setAuthQrDataUrl(null)
      return
    }
    QRCode.toDataURL(authUrl, { margin: 1, width: 160 }).then(setAuthQrDataUrl)
  }, [authUrl])

  useEffect(() => {
    if (!status.hostname) {
      setTsQrDataUrl(null)
      return
    }
    QRCode.toDataURL(`https://${status.hostname}`, { margin: 1, width: 160 }).then(setTsQrDataUrl)
  }, [status.hostname])

  async function handleInstall(): Promise<void> {
    setError(null)
    setInstalling(true)
    setInstallProgress(null)
    try {
      await window.launcher.tailscale.install()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstalling(false)
      setInstallProgress(null)
    }
  }

  async function handleConnect(): Promise<void> {
    setError(null)
    setConnecting(true)
    setAuthUrl(null)
    try {
      await window.launcher.tailscale.connect()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
      setAuthUrl(null)
    }
  }

  async function handleDisconnect(): Promise<void> {
    setError(null)
    try {
      await window.launcher.tailscale.disconnect()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="rounded-md border border-border/60 px-3 py-2.5">
      <p className="mb-2 text-sm font-medium text-foreground">Tailscale</p>

      {!status.installed && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Instala Tailscale para que solo tus propios dispositivos puedan acceder al panel, sin abrir ningún puerto a
            internet. Windows pedirá confirmación de administrador para instalar el servicio — es un único paso.
          </p>
          {installing && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {installProgress
                ? `Descargando… ${formatBytes(installProgress.downloadedBytes)}${
                    installProgress.totalBytes ? ` / ${formatBytes(installProgress.totalBytes)}` : ''
                  }`
                : 'Instalando (puede pedir confirmación de administrador)…'}
            </p>
          )}
          <Button size="sm" onClick={handleInstall} disabled={installing}>
            Instalar Tailscale
          </Button>
        </div>
      )}

      {status.installed && !status.connected && (
        <div className="space-y-2">
          {!connecting && (
            <Button size="sm" onClick={handleConnect}>
              Conectar
            </Button>
          )}
          {connecting && !authUrl && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Conectando…
            </p>
          )}
          {connecting && authUrl && (
            <div className="flex items-center gap-4">
              {authQrDataUrl && <img src={authQrDataUrl} alt="Código QR de inicio de sesión" className="h-24 w-24 shrink-0 rounded" />}
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Esperando confirmación en el navegador…
                </p>
                <a href={authUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline break-all">
                  {authUrl}
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {status.connected && (
        <div className="flex items-center gap-4">
          {tsQrDataUrl && <img src={tsQrDataUrl} alt="Código QR del hostname de Tailscale" className="h-24 w-24 shrink-0 rounded" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Hostname</p>
            <div className="flex items-center gap-2">
              <code className="truncate text-sm text-foreground">{status.hostname}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => status.hostname && navigator.clipboard.writeText(`https://${status.hostname}`)}
              >
                Copiar
              </Button>
            </div>
            <Button size="sm" variant="outline" className="mt-2" onClick={handleDisconnect}>
              Desconectar
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function PasswordSection({
  accountConfigured,
  onChanged
}: {
  accountConfigured: boolean
  onChanged: () => void
}): JSX.Element {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(): Promise<void> {
    setError(null)
    if (next.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (next !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    setBusy(true)
    try {
      if (accountConfigured) {
        await window.launcher.remoteAccess.changePassword(current, next)
      } else {
        await window.launcher.remoteAccess.setPassword(next)
      }
      setCurrent('')
      setNext('')
      setConfirm('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border/60 px-3 py-2.5">
      <p className="mb-2 text-sm font-medium text-foreground">
        {accountConfigured ? 'Cambiar contraseña del panel' : 'Configura la contraseña del panel'}
      </p>
      <div className="space-y-2">
        {accountConfigured && (
          <Input
            type="password"
            placeholder="Contraseña actual"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        )}
        <Input type="password" placeholder="Nueva contraseña" value={next} onChange={(e) => setNext(e.target.value)} />
        <Input
          type="password"
          placeholder="Confirmar nueva contraseña"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button size="sm" onClick={submit} disabled={busy}>
          {accountConfigured ? 'Cambiar contraseña' : 'Crear contraseña'}
        </Button>
      </div>
    </div>
  )
}
