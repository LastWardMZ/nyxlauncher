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
import type {
  AccessLogEntry,
  AppSettings,
  CloudflareStatus,
  RemoteAccessProfile,
  RemoteServerStatus,
  RemoteSessionInfo,
  TailscaleStatus,
  TotpSetupInfo,
  TrustedDeviceInfo
} from '@shared/types'

export function RemoteAccessSettings(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [accountConfigured, setAccountConfigured] = useState(false)
  const [serverStatus, setServerStatus] = useState<RemoteServerStatus>({ running: false, port: null, lanIp: null })
  const [sessions, setSessions] = useState<RemoteSessionInfo[]>([])
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [portInput, setPortInput] = useState('')
  const [allowlistInput, setAllowlistInput] = useState('')
  const [notifyEmailInput, setNotifyEmailInput] = useState('')
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus>({
    installed: false,
    connected: false,
    hostname: null,
    tailscaleIp: null,
    authUrl: null
  })
  const [cloudflareStatus, setCloudflareStatus] = useState<CloudflareStatus>({
    installed: false,
    running: false,
    mode: 'off',
    publicUrl: null,
    error: null
  })

  async function refreshAll(): Promise<void> {
    const [s, auth, server, sess, ts, cf] = await Promise.all([
      window.launcher.settings.get(),
      window.launcher.remoteAccess.getAuthStatus(),
      window.launcher.remoteAccess.getServerStatus(),
      window.launcher.remoteAccess.listSessions(),
      window.launcher.tailscale.getStatus(),
      window.launcher.cloudflare.getStatus()
    ])
    setSettings(s)
    setPortInput(String(s.remoteAccess.lanPort))
    setAllowlistInput(s.remoteAccess.ipAllowlist)
    setNotifyEmailInput(s.remoteAccess.notifyEmail)
    setAccountConfigured(auth.accountConfigured)
    setServerStatus(server)
    setSessions(sess)
    setTailscaleStatus(ts)
    setCloudflareStatus(cf)
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

  async function updateSettings(patch: Partial<AppSettings['remoteAccess']>): Promise<boolean> {
    const next = { ...settings, remoteAccess: { ...settings.remoteAccess, ...patch } }
    setSettings(next)
    try {
      await window.launcher.settings.update(next)
      return true
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
      setSettings(settings)
      return false
    }
  }

  async function toggleLan(enabled: boolean): Promise<void> {
    const port = Number(portInput) || settings.remoteAccess.lanPort
    if (!(await updateSettings({ lanEnabled: enabled, lanPort: port }))) return
    setServerStatus(await window.launcher.remoteAccess.getServerStatus())
  }

  async function applyPort(): Promise<void> {
    if (!settings.remoteAccess.lanEnabled) return
    await toggleLan(true)
  }

  async function updateProfile(profile: RemoteAccessProfile): Promise<void> {
    if (
      settings.remoteAccess.profile === 'cloudflare' &&
      profile !== 'cloudflare' &&
      settings.remoteAccess.customDomain &&
      !confirm(`Tienes el dominio "${settings.remoteAccess.customDomain}" activo — dejará de funcionar. ¿Seguro?`)
    ) {
      return
    }
    await updateSettings({ profile })
    refreshAll()
  }

  async function applyAllowlist(): Promise<void> {
    await updateSettings({ ipAllowlist: allowlistInput })
  }

  async function applyNotifyEmail(): Promise<void> {
    await updateSettings({ notifyEmail: notifyEmailInput })
  }

  async function applyInactivity(minutes: number): Promise<void> {
    await updateSettings({ sessionInactivityMinutes: minutes })
  }

  const lanUrl = serverStatus.running && serverStatus.lanIp ? `http://${serverStatus.lanIp}:${serverStatus.port}` : null

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Acceso remoto</CardTitle>
        <CardDescription>
          Abre el panel de NyxLauncher desde el navegador de otro dispositivo en tu red local o desde internet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border/60 px-3 py-2.5 text-sm">
          Estado:{' '}
          <span className="font-medium text-foreground">
            {statusLabel(settings, serverStatus, tailscaleStatus, cloudflareStatus)}
          </span>
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
          <Select value={settings.remoteAccess.profile} onValueChange={(v) => updateProfile(v as RemoteAccessProfile)} disabled={!loaded}>
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Desactivado</SelectItem>
              <SelectItem value="tailscale">Solo mis dispositivos (Tailscale)</SelectItem>
              <SelectItem value="cloudflare" disabled={!settings.remoteAccess.totpEnabled}>
                Acceso público (requiere 2FA)
              </SelectItem>
            </SelectContent>
          </Select>
          {!settings.remoteAccess.totpEnabled && (
            <p className="mt-2 text-xs text-amber-400">
              Activa la verificación en dos pasos más abajo para poder elegir el acceso público.
            </p>
          )}
        </div>

        {settings.remoteAccess.profile === 'tailscale' && (
          <TailscalePanel status={tailscaleStatus} onChanged={refreshAll} />
        )}

        {settings.remoteAccess.profile === 'cloudflare' && (
          <CloudflarePanel status={cloudflareStatus} onChanged={refreshAll} />
        )}

        <TotpSection totpEnabled={settings.remoteAccess.totpEnabled} onChanged={refreshAll} />

        <div className="rounded-md border border-border/60 px-3 py-2.5">
          <Label className="text-foreground">Lista blanca de IPs</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            CIDRs separados por coma (ej. 192.168.1.0/24). Vacío = cualquier IP permitida.
          </p>
          <div className="mt-2 flex items-end gap-2">
            <Input
              className="flex-1"
              placeholder="Vacío = sin restricción"
              value={allowlistInput}
              onChange={(e) => setAllowlistInput(e.target.value)}
            />
            <Button size="sm" variant="outline" onClick={applyAllowlist}>
              Guardar
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border/60 px-3 py-2.5">
          <Label className="text-foreground">Expiración de sesión</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Minutos de inactividad antes de cerrar sesión sola.</p>
          <Input
            type="number"
            className="mt-2"
            value={settings.remoteAccess.sessionInactivityMinutes}
            onChange={(e) => applyInactivity(Number(e.target.value) || 0)}
          />
        </div>

        <EmailSection notifyEmail={notifyEmailInput} onNotifyEmailChange={setNotifyEmailInput} onApplyNotifyEmail={applyNotifyEmail} />

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

        {settings.remoteAccess.profile === 'cloudflare' && <DevicesSection />}

        <AccessLogSection />
      </CardContent>
    </Card>
  )
}

function statusLabel(
  settings: AppSettings,
  server: RemoteServerStatus,
  tailscale: TailscaleStatus,
  cloudflare: CloudflareStatus
): string {
  const lan = settings.remoteAccess.lanEnabled && server.running
  const ts = settings.remoteAccess.profile === 'tailscale' && tailscale.connected
  const cf = settings.remoteAccess.profile === 'cloudflare' && cloudflare.running
  const parts: string[] = []
  if (lan) parts.push('LAN')
  if (ts) parts.push('Tailscale')
  if (cf) parts.push('Público (Cloudflare)')
  return parts.length ? parts.join(' + ') : 'Desactivado'
}

function TailscalePanel({ status, onChanged }: { status: TailscaleStatus; onChanged: () => void }): JSX.Element {
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
              {authQrDataUrl && (
                <img src={authQrDataUrl} alt="Código QR de inicio de sesión" className="h-24 w-24 shrink-0 rounded" />
              )}
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Esperando confirmación en el navegador…
                </p>
                <a href={authUrl} target="_blank" rel="noreferrer" className="break-all text-xs text-primary underline">
                  {authUrl}
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {status.connected && (
        <div className="flex items-center gap-4">
          {tsQrDataUrl && (
            <img src={tsQrDataUrl} alt="Código QR del hostname de Tailscale" className="h-24 w-24 shrink-0 rounded" />
          )}
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

function CloudflarePanel({ status, onChanged }: { status: CloudflareStatus; onChanged: () => void }): JSX.Element {
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState<{ downloadedBytes: number; totalBytes: number | null } | null>(
    null
  )
  const [setupMode, setSetupMode] = useState<'quick' | 'domain'>('quick')
  const [useManualDomain, setUseManualDomain] = useState(false)
  const [domain, setDomain] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [dnsCheck, setDnsCheck] = useState<{ resolves: boolean; addresses: string[] } | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    return window.launcher.events.onCloudflareInstallProgress(setInstallProgress)
  }, [])

  useEffect(() => {
    if (!status.publicUrl) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(status.publicUrl, { margin: 1, width: 160 }).then(setQrDataUrl)
  }, [status.publicUrl])

  async function handleInstall(): Promise<void> {
    setError(null)
    setInstalling(true)
    setInstallProgress(null)
    try {
      await window.launcher.cloudflare.install()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstalling(false)
      setInstallProgress(null)
    }
  }

  async function handleQuickConnect(): Promise<void> {
    setError(null)
    setConnecting(true)
    try {
      await window.launcher.cloudflare.connectQuick()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  async function handleCheckDns(): Promise<void> {
    setError(null)
    setDnsCheck(await window.launcher.caddy.checkDns(domain))
  }

  async function handleDomainConnect(): Promise<void> {
    setError(null)
    setConnecting(true)
    try {
      if (useManualDomain) {
        const check = await window.launcher.caddy.checkDns(domain)
        setDnsCheck(check)
        if (!check.resolves) {
          setError('El dominio todavía no resuelve — comprueba el registro DNS antes de activar')
          return
        }
        const caddyStatus = await window.launcher.caddy.getStatus()
        if (!caddyStatus.installed) await window.launcher.caddy.install()
        await window.launcher.caddy.start(domain)
      } else {
        await window.launcher.cloudflare.connectDomain(domain, apiToken)
      }
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect(): Promise<void> {
    setError(null)
    try {
      await window.launcher.cloudflare.disconnect()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="rounded-md border border-border/60 px-3 py-2.5">
      <p className="mb-2 text-sm font-medium text-foreground">Cloudflare (acceso público)</p>

      {!status.installed && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Expone el panel a internet a través de Cloudflare, sin abrir puertos en tu router.
          </p>
          {installing && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {installProgress ? `Descargando… ${formatBytes(installProgress.downloadedBytes)}` : 'Instalando…'}
            </p>
          )}
          <Button size="sm" onClick={handleInstall} disabled={installing}>
            Instalar cloudflared
          </Button>
        </div>
      )}

      {status.installed && !status.running && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={setupMode === 'quick' ? 'default' : 'outline'} onClick={() => setSetupMode('quick')}>
              Sin dominio
            </Button>
            <Button size="sm" variant={setupMode === 'domain' ? 'default' : 'outline'} onClick={() => setSetupMode('domain')}>
              Dominio propio
            </Button>
          </div>

          {setupMode === 'quick' && (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Genera una URL pública gratuita (*.trycloudflare.com) al instante, sin cuenta de Cloudflare.
              </p>
              <Button size="sm" onClick={handleQuickConnect} disabled={connecting}>
                {connecting ? 'Conectando…' : 'Activar túnel rápido'}
              </Button>
            </div>
          )}

          {setupMode === 'domain' && (
            <div className="space-y-2">
              <Input placeholder="panel.tudominio.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useManualDomain}
                  onChange={(e) => setUseManualDomain(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Mi dominio no está en Cloudflare
              </label>
              {!useManualDomain ? (
                <Input
                  type="password"
                  placeholder="Token de API de Cloudflare (Zone:Read, DNS:Edit, Cloudflare Tunnel:Edit)"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                />
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Apunta un registro A de este dominio a la IP pública de este equipo y abre el puerto correspondiente
                    en tu router.
                  </p>
                  <Button size="sm" variant="outline" onClick={handleCheckDns} disabled={!domain}>
                    Comprobar DNS
                  </Button>
                  {dnsCheck && (
                    <p className={`text-xs ${dnsCheck.resolves ? 'text-emerald-400' : 'text-destructive'}`}>
                      {dnsCheck.resolves ? `Resuelve a ${dnsCheck.addresses.join(', ')}` : 'Todavía no resuelve'}
                    </p>
                  )}
                </div>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                size="sm"
                onClick={handleDomainConnect}
                disabled={connecting || !domain || (!useManualDomain && !apiToken)}
              >
                {connecting ? 'Conectando…' : 'Activar'}
              </Button>
            </div>
          )}
        </div>
      )}

      {status.running && (
        <div className="flex items-center gap-4">
          {qrDataUrl && <img src={qrDataUrl} alt="Código QR de acceso público" className="h-24 w-24 shrink-0 rounded" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">URL pública</p>
            <div className="flex items-center gap-2">
              <code className="truncate text-sm text-foreground">{status.publicUrl}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => status.publicUrl && navigator.clipboard.writeText(status.publicUrl)}
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

      {error && (status.running || !status.installed || setupMode !== 'domain') && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}

function TotpSection({ totpEnabled, onChanged }: { totpEnabled: boolean; onChanged: () => void }): JSX.Element {
  const [setupInfo, setSetupInfo] = useState<TotpSetupInfo | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!setupInfo) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(setupInfo.otpauthUrl, { margin: 1, width: 160 }).then(setQrDataUrl)
  }, [setupInfo])

  async function beginSetup(): Promise<void> {
    setError(null)
    setSetupInfo(await window.launcher.totp.begin())
  }

  async function verify(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      const ok = await window.launcher.totp.verify(code)
      if (!ok) {
        setError('Código incorrecto')
        return
      }
      setSetupInfo(null)
      setCode('')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function disable(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      await window.launcher.totp.disable(password)
      setPassword('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border/60 px-3 py-2.5">
      <Label className="text-foreground">Verificación en dos pasos (2FA)</Label>
      <p className="mt-0.5 text-xs text-muted-foreground">Obligatoria para poder elegir el perfil de acceso público.</p>

      {totpEnabled ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-emerald-400">Activada</p>
          <Input
            type="password"
            placeholder="Contraseña para desactivar"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" variant="outline" onClick={disable} disabled={busy || !password}>
            Desactivar 2FA
          </Button>
        </div>
      ) : setupInfo ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-4">
            {qrDataUrl && <img src={qrDataUrl} className="h-32 w-32 rounded" alt="Código QR de configuración de 2FA" />}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Escanéalo con Google Authenticator, Authy, etc., o introduce el código manualmente:
              </p>
              <code className="break-all text-xs text-foreground">{setupInfo.secret}</code>
            </div>
          </div>
          <Input
            inputMode="numeric"
            placeholder="Código de 6 dígitos"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" onClick={verify} disabled={busy || code.length < 6}>
            Confirmar
          </Button>
        </div>
      ) : (
        <Button size="sm" className="mt-2" onClick={beginSetup}>
          Activar 2FA
        </Button>
      )}
    </div>
  )
}

function DevicesSection(): JSX.Element {
  const [devices, setDevices] = useState<TrustedDeviceInfo[]>([])

  async function refresh(): Promise<void> {
    setDevices(await window.launcher.devices.list())
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (devices.length === 0) return <></>

  return (
    <div className="rounded-md border border-border/60 px-3 py-2.5">
      <p className="mb-2 text-sm font-medium text-foreground">Dispositivos de confianza</p>
      <div className="space-y-2">
        {devices.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-xs">
            <div className="min-w-0 text-muted-foreground">
              <span className="text-foreground">{d.ip}</span> · {d.userAgent.slice(0, 50)}
              {d.status === 'pending' && <span className="ml-1 text-amber-400">(pendiente)</span>}
              <br />
              último acceso {new Date(d.lastSeenAt).toLocaleString()}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await window.launcher.devices.revoke(d.id)
                refresh()
              }}
            >
              Revocar
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

const ACCESS_RESULT_LABEL: Record<AccessLogEntry['result'], string> = {
  success: 'Éxito',
  failure: 'Fallo',
  blocked: 'Bloqueado'
}
const ACCESS_RESULT_COLOR: Record<AccessLogEntry['result'], string> = {
  success: 'text-emerald-400',
  failure: 'text-amber-400',
  blocked: 'text-destructive'
}

function AccessLogSection(): JSX.Element {
  const [entries, setEntries] = useState<AccessLogEntry[]>([])

  useEffect(() => {
    window.launcher.accessLog.list().then(setEntries)
  }, [])

  if (entries.length === 0) return <></>

  return (
    <div className="rounded-md border border-border/60 px-3 py-2.5">
      <p className="mb-2 text-sm font-medium text-foreground">Registro de accesos</p>
      <div className="max-h-56 space-y-1 overflow-y-auto scrollbar-thin">
        {entries.slice(0, 100).map((e) => (
          <div key={e.id} className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {new Date(e.timestamp).toLocaleString()} · {e.ip}
            </span>
            <span className={ACCESS_RESULT_COLOR[e.result]}>{ACCESS_RESULT_LABEL[e.result]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmailSection({
  notifyEmail,
  onNotifyEmailChange,
  onApplyNotifyEmail
}: {
  notifyEmail: string
  onNotifyEmailChange: (value: string) => void
  onApplyNotifyEmail: () => void
}): JSX.Element {
  const [configured, setConfigured] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.launcher.email.getStatus().then((s) => setConfigured(s.configured))
  }, [])

  async function saveApiKey(): Promise<void> {
    setBusy(true)
    try {
      await window.launcher.email.setApiKey(apiKey)
      setApiKey('')
      setConfigured((await window.launcher.email.getStatus()).configured)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border/60 px-3 py-2.5">
      <Label className="text-foreground">Avisos por email</Label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Te avisa de cada login nuevo y de dispositivos pendientes de aprobar. Usa la API de Resend.
      </p>
      <div className="mt-2 space-y-2">
        <div className="flex items-end gap-2">
          <Input
            className="flex-1"
            placeholder="tu@email.com"
            value={notifyEmail}
            onChange={(e) => onNotifyEmailChange(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={onApplyNotifyEmail}>
            Guardar
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <Input
            type="password"
            className="flex-1"
            placeholder={configured ? 'API key configurada' : 'API key de Resend'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={saveApiKey} disabled={busy || !apiKey}>
            Guardar
          </Button>
        </div>
      </div>
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
