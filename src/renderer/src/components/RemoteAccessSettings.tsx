import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { DEFAULT_APP_SETTINGS } from '@shared/types'
import type { AppSettings, RemoteServerStatus, RemoteSessionInfo } from '@shared/types'

export function RemoteAccessSettings(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [accountConfigured, setAccountConfigured] = useState(false)
  const [serverStatus, setServerStatus] = useState<RemoteServerStatus>({ running: false, port: null, lanIp: null })
  const [sessions, setSessions] = useState<RemoteSessionInfo[]>([])
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [portInput, setPortInput] = useState('')

  async function refreshAll(): Promise<void> {
    const [s, auth, server, sess] = await Promise.all([
      window.launcher.settings.get(),
      window.launcher.remoteAccess.getAuthStatus(),
      window.launcher.remoteAccess.getServerStatus(),
      window.launcher.remoteAccess.listSessions()
    ])
    setSettings(s)
    setPortInput(String(s.remoteAccess.lanPort))
    setAccountConfigured(auth.accountConfigured)
    setServerStatus(server)
    setSessions(sess)
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
          Estado: <span className="font-medium text-foreground">{statusLabel(settings, serverStatus)}</span>
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

function statusLabel(settings: AppSettings, server: RemoteServerStatus): string {
  if (!settings.remoteAccess.lanEnabled || !server.running) return 'Desactivado'
  return 'Solo LAN'
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
