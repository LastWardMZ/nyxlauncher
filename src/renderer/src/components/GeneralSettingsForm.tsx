import { useState } from 'react'
import { FolderOpen, FileCode2, Check } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { useServerStore } from '@renderer/store/serverStore'
import { FLAVOR_LABELS } from '@shared/types'
import type { LaunchMode, ServerConfig, ServerFlavor, UpdateCheckHours } from '@shared/types'

const UPDATE_CHECK_OPTIONS: { value: string; label: string; hours: UpdateCheckHours }[] = [
  { value: 'off', label: 'Desactivado', hours: null },
  { value: '1', label: 'Cada hora', hours: 1 },
  { value: '6', label: 'Cada 6 horas', hours: 6 },
  { value: '24', label: 'Cada día', hours: 24 }
]

export function GeneralSettingsForm({ server }: { server: ServerConfig }): JSX.Element {
  const updateServer = useServerStore((s) => s.updateServer)

  const [form, setForm] = useState(server)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const dirty = JSON.stringify(form) !== JSON.stringify(server)

  function set<K extends keyof ServerConfig>(key: K, value: ServerConfig[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function pickDirectory(): Promise<void> {
    const dir = await window.launcher.dialogs.pickDirectory()
    if (dir) set('workingDirectory', dir)
  }

  async function pickExecutable(): Promise<void> {
    const filters =
      form.launchMode === 'jar'
        ? [{ name: 'Java Archive', extensions: ['jar'] }]
        : [{ name: 'Ejecutables', extensions: ['exe', 'bat', 'sh', 'cmd', '*'] }]
    const file = await window.launcher.dialogs.pickFile(filters)
    if (file) set('executable', file)
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    try {
      await updateServer(form)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scrollbar-thin pr-1">
      <Section title="General">
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Directorio de trabajo">
          <div className="flex gap-2">
            <Input value={form.workingDirectory} onChange={(e) => set('workingDirectory', e.target.value)} />
            <Button type="button" variant="outline" size="icon" onClick={pickDirectory}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Puerto">
            <Input
              type="number"
              value={form.port ?? ''}
              onChange={(e) => set('port', e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label="Software">
            <Select value={form.flavor} onValueChange={(v) => set('flavor', v as ServerFlavor)}>
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
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
          <Label className="cursor-pointer">Auto-reinicio</Label>
          <Switch checked={form.autoRestart} onCheckedChange={(v) => set('autoRestart', v)} />
        </div>
      </Section>

      <Section title="Lanzamiento">
        <Field label="Modo de lanzamiento">
          <Select value={form.launchMode} onValueChange={(v) => set('launchMode', v as LaunchMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="command">Comando / ejecutable personalizado</SelectItem>
              <SelectItem value="jar">Archivo .jar (vía Java)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={form.launchMode === 'jar' ? 'Archivo .jar' : 'Ejecutable'}>
          <div className="flex gap-2">
            <Input value={form.executable} onChange={(e) => set('executable', e.target.value)} />
            <Button type="button" variant="outline" size="icon" onClick={pickExecutable}>
              <FileCode2 className="h-4 w-4" />
            </Button>
          </div>
        </Field>
        <Field label="Argumentos de lanzamiento">
          <Input
            value={form.args.join(' ')}
            onChange={(e) => set('args', e.target.value.trim() ? e.target.value.trim().split(/\s+/) : [])}
          />
        </Field>

        {form.launchMode === 'jar' && (
          <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Runtime de Java</p>
            <Field label="Ejecutable de Java">
              <Input value={form.java.javaPath} onChange={(e) => set('java', { ...form.java, javaPath: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Memoria mínima (MB)">
                <Input
                  type="number"
                  value={form.java.minMemoryMb}
                  onChange={(e) => set('java', { ...form.java, minMemoryMb: Number(e.target.value) })}
                />
              </Field>
              <Field label="Memoria máxima (MB)">
                <Input
                  type="number"
                  value={form.java.maxMemoryMb}
                  onChange={(e) => set('java', { ...form.java, maxMemoryMb: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="Argumentos JVM adicionales">
              <Input value={form.java.extraArgs} onChange={(e) => set('java', { ...form.java, extraArgs: e.target.value })} />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Actualizaciones del servidor">
        <Field label="Comprobar automáticamente mientras esté en línea">
          <Select
            value={UPDATE_CHECK_OPTIONS.find((o) => o.hours === form.updateCheck.autoCheckHours)?.value ?? 'off'}
            onValueChange={(v) =>
              set('updateCheck', {
                autoCheckHours: UPDATE_CHECK_OPTIONS.find((o) => o.value === v)?.hours ?? null
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UPDATE_CHECK_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Consulta la API de Paper/Purpur/Velocity y avisa si hay una build más reciente para tu versión. Solo
            disponible si instalaste el servidor con el descargador integrado — también puedes comprobarlo a
            mano desde el botón junto al estado del servidor.
          </p>
        </Field>
      </Section>

      <Section title="Rutas de archivos gestionados">
        <Field label="Archivo de configuración principal">
          <Input value={form.configFilePath} onChange={(e) => set('configFilePath', e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Whitelist">
            <Input
              value={form.playerListFiles.whitelist}
              onChange={(e) => set('playerListFiles', { ...form.playerListFiles, whitelist: e.target.value })}
            />
          </Field>
          <Field label="Ops">
            <Input
              value={form.playerListFiles.ops}
              onChange={(e) => set('playerListFiles', { ...form.playerListFiles, ops: e.target.value })}
            />
          </Field>
          <Field label="Baneados">
            <Input
              value={form.playerListFiles.banned}
              onChange={(e) => set('playerListFiles', { ...form.playerListFiles, banned: e.target.value })}
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center gap-3 pb-2">
        <Button disabled={!dirty || saving} onClick={handleSave}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
        {!dirty && savedAt && (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check className="h-3.5 w-3.5" /> Guardado
          </span>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
