import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import { DEFAULT_APP_SETTINGS } from '@shared/types'
import type { AppSettings, AppUpdateStatus } from '@shared/types'

export function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>({ state: 'idle' })

  useEffect(() => {
    window.launcher.settings.get().then((s) => {
      setSettings(s)
      setLoaded(true)
    })
    window.launcher.app.getVersion().then(setVersion)
    return window.launcher.events.onAppUpdateStatus(setUpdateStatus)
  }, [])

  async function update(patch: Partial<AppSettings>): Promise<void> {
    const next = { ...settings, ...patch }
    setSettings(next)
    await window.launcher.settings.update(next)
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-2xl px-8 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Preferencias generales del launcher.</p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Apariencia y comportamiento</CardTitle>
            <CardDescription>Estas opciones se aplican a nivel de aplicación.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Row
              label="Notificaciones del sistema"
              description="Avisos al iniciar, caer, completar backups o encontrar una build nueva."
              checked={settings.notificationsEnabled}
              disabled={!loaded}
              onChange={(v) => update({ notificationsEnabled: v })}
            />
            <Row
              label="Iniciar con el sistema"
              description="Abrir el launcher automáticamente al arrancar el PC."
              checked={settings.launchOnStartup}
              disabled={!loaded}
              onChange={(v) => update({ launchOnStartup: v })}
            />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Actualizaciones</CardTitle>
            <CardDescription>NyxLauncher se actualiza solo en segundo plano.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
              <div>
                <p className="text-sm text-foreground">Versión instalada {version ? `· ${version}` : ''}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{updateStatusLabel(updateStatus)}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
                onClick={() => window.launcher.app.checkForUpdates()}
              >
                {updateStatus.state === 'checking' || updateStatus.state === 'downloading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Buscar actualizaciones
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function updateStatusLabel(status: AppUpdateStatus): string {
  switch (status.state) {
    case 'checking':
      return 'Buscando actualizaciones...'
    case 'available':
      return `Descargando NyxLauncher ${status.version}...`
    case 'not-available':
      return 'Ya tienes la última versión.'
    case 'downloading':
      return `Descargando actualización... ${status.percent}%`
    case 'downloaded':
      return `NyxLauncher ${status.version} listo — se instalará al reiniciar.`
    case 'error':
      return `No se pudo comprobar: ${status.message}`
    default:
      return 'Comprueba en segundo plano cada hora.'
  }
}

function Row({
  label,
  description,
  checked,
  disabled,
  onChange
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
      <div>
        <Label className="text-foreground">{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}
