import { useEffect, useState } from 'react'
import { Archive, Clock, HardDrive, RotateCcw, Save, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { useServerStore } from '@renderer/store/serverStore'
import { formatMemory } from '@renderer/lib/utils'
import type { BackupEntry, BackupScheduleHours, ServerConfig } from '@shared/types'

const SCHEDULE_OPTIONS: { value: string; label: string; hours: BackupScheduleHours }[] = [
  { value: 'off', label: 'Desactivado', hours: null },
  { value: '6', label: 'Cada 6 horas', hours: 6 },
  { value: '12', label: 'Cada 12 horas', hours: 12 },
  { value: '24', label: 'Cada día', hours: 24 },
  { value: '48', label: 'Cada 2 días', hours: 48 },
  { value: '168', label: 'Cada semana', hours: 168 }
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function BackupsTab({ server }: { server: ServerConfig }): JSX.Element {
  const updateServer = useServerStore((s) => s.updateServer)
  const status = useServerStore((s) => s.runtime[server.id]?.status ?? 'stopped')
  const isRunning = status !== 'stopped' && status !== 'crashed' && status !== 'error'

  const [sourcePath, setSourcePath] = useState(server.backup.sourcePath)
  const [scheduleValue, setScheduleValue] = useState(
    SCHEDULE_OPTIONS.find((o) => o.hours === server.backup.scheduleHours)?.value ?? 'off'
  )
  const [savingConfig, setSavingConfig] = useState(false)

  const [backups, setBackups] = useState<BackupEntry[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BackupEntry | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadBackups(): Promise<void> {
    setBackups(await window.launcher.backups.list(server.id))
  }

  useEffect(() => {
    void loadBackups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id])

  const configDirty =
    sourcePath !== server.backup.sourcePath ||
    scheduleValue !== (SCHEDULE_OPTIONS.find((o) => o.hours === server.backup.scheduleHours)?.value ?? 'off')

  async function handleSaveConfig(): Promise<void> {
    setSavingConfig(true)
    try {
      const hours = SCHEDULE_OPTIONS.find((o) => o.value === scheduleValue)?.hours ?? null
      await updateServer({ ...server, backup: { sourcePath: sourcePath.trim(), scheduleHours: hours } })
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleCreateBackup(): Promise<void> {
    setCreating(true)
    setError(null)
    try {
      await window.launcher.backups.create(server.id)
      await loadBackups()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function handleRestore(entry: BackupEntry): Promise<void> {
    setError(null)
    try {
      await window.launcher.backups.restore(server.id, entry.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDelete(entry: BackupEntry): Promise<void> {
    await window.launcher.backups.remove(server.id, entry.id)
    await loadBackups()
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-thin sm:grid sm:grid-cols-[340px_1fr] sm:overflow-hidden">
      <div className="min-h-0 space-y-4 sm:overflow-y-auto sm:scrollbar-thin sm:pr-1">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Configuración</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Carpeta a respaldar</Label>
              <Input
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder="world (vacío = todo el directorio)"
              />
              <p className="text-[11px] text-muted-foreground">
                Ruta relativa al directorio del servidor. Déjalo vacío para respaldar todo.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Backups programados</Label>
              <Select value={scheduleValue} onValueChange={setScheduleValue}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="w-full gap-1.5" disabled={!configDirty || savingConfig} onClick={handleSaveConfig}>
              <Save className="h-3.5 w-3.5" /> {savingConfig ? 'Guardando...' : 'Guardar configuración'}
            </Button>
          </CardContent>
        </Card>

        <Button className="w-full gap-1.5" disabled={creating} onClick={handleCreateBackup}>
          <Archive className="h-4 w-4" /> {creating ? 'Creando backup...' : 'Crear backup ahora'}
        </Button>

        {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      </div>

      <div className="min-h-0 sm:overflow-y-auto sm:scrollbar-thin sm:pr-1">
        {backups === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando backups...</p>
        ) : backups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Archive className="h-8 w-8 opacity-40" />
            <p className="text-sm">Todavía no hay copias de seguridad</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {backups.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatDate(entry.createdAt)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" /> {formatMemory(entry.sizeBytes / 1024 / 1024)}
                    </span>
                    <span className="font-mono">{entry.sourcePath || '(todo el directorio)'}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title={isRunning ? 'Detén el servidor para restaurar' : 'Restaurar'}
                    disabled={isRunning}
                    onClick={() => setRestoreTarget(entry)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    title="Eliminar"
                    onClick={() => setDeleteTarget(entry)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title="¿Restaurar esta copia de seguridad?"
        description={`Se sobrescribirán los archivos en "${restoreTarget?.sourcePath || '(todo el directorio)'}" con el contenido del backup del ${restoreTarget ? formatDate(restoreTarget.createdAt) : ''}.`}
        confirmLabel="Restaurar"
        onConfirm={() => restoreTarget && handleRestore(restoreTarget)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar esta copia de seguridad?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  )
}
