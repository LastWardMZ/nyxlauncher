import { useEffect, useRef, useState } from 'react'
import { Coffee, Download, Loader2, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import type { JavaManagedInstall } from '@shared/types'

export function JavaManagerSettings(): JSX.Element {
  const [installs, setInstalls] = useState<JavaManagedInstall[] | null>(null)
  const [busyVersion, setBusyVersion] = useState<number | null>(null)
  const busyVersionRef = useRef<number | null>(null)
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(): Promise<void> {
    setInstalls(await window.launcher.java.list())
  }

  useEffect(() => {
    void load()
    return window.launcher.events.onJavaInstallProgress((p) => {
      if (busyVersionRef.current === p.majorVersion) setProgress({ downloaded: p.downloadedBytes, total: p.totalBytes })
    })
  }, [])

  async function install(majorVersion: number): Promise<void> {
    busyVersionRef.current = majorVersion
    setBusyVersion(majorVersion)
    setProgress({ downloaded: 0, total: null })
    setError(null)
    try {
      await window.launcher.java.install(majorVersion)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      busyVersionRef.current = null
      setBusyVersion(null)
      setProgress(null)
    }
  }

  async function remove(majorVersion: number): Promise<void> {
    setBusyVersion(majorVersion)
    setError(null)
    try {
      await window.launcher.java.remove(majorVersion)
      await load()
    } finally {
      setBusyVersion(null)
    }
  }

  const progressPct = progress?.total && progress.total > 0 ? Math.round((progress.downloaded / progress.total) * 100) : null

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Java</CardTitle>
        <CardDescription>
          Descarga la versión de Java que necesite cada servidor — evita el clásico "no arranca y no sé por qué".
          Solo disponible en el instalador de Windows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {installs === null && (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        {installs?.map((entry) => (
          <div
            key={entry.majorVersion}
            className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Java {entry.majorVersion}</span>
              {entry.installed && <Badge variant="success">Instalado</Badge>}
            </div>
            {busyVersion === entry.majorVersion ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {progressPct !== null ? `${progressPct}%` : 'Descargando...'}
              </span>
            ) : entry.installed ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busyVersion !== null}
                onClick={() => remove(entry.majorVersion)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={busyVersion !== null} onClick={() => install(entry.majorVersion)}>
                <Download className="h-3.5 w-3.5" /> Descargar
              </Button>
            )}
          </div>
        ))}
        <p className="pt-1 text-[11px] text-muted-foreground">
          Elige la versión gestionada en el "Runtime de Java" de cada servidor, en su pestaña Configuración.
        </p>
      </CardContent>
    </Card>
  )
}
