import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { AlertTriangle, Code2, FileQuestion, Save, SlidersHorizontal } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { useServerStore } from '@renderer/store/serverStore'
import { parseProperties, updateProperties } from '@shared/propertiesFile'

const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard']
const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator']

const DEFAULT_SERVER_PROPERTIES = `#Minecraft server properties
motd=A Minecraft Server
max-players=20
difficulty=normal
gamemode=survival
pvp=true
white-list=false
online-mode=true
server-port=25565
view-distance=10
spawn-protection=16
enable-command-block=false
level-seed=
`

export function ServerPropertiesEditor({
  serverId,
  configFilePath
}: {
  serverId: string
  configFilePath: string
}): JSX.Element {
  const status = useServerStore((s) => s.runtime[serverId]?.status ?? 'stopped')
  const isRunning = status !== 'stopped' && status !== 'crashed' && status !== 'error'

  const [raw, setRaw] = useState<string | null>(null)
  const [exists, setExists] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'visual' | 'raw'>('visual')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.launcher.files.readText(serverId, configFilePath).then((result) => {
      if (cancelled) return
      if (result === null) {
        setExists(false)
        setRaw(DEFAULT_SERVER_PROPERTIES)
      } else {
        setExists(true)
        setRaw(result.content)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [serverId, configFilePath])

  async function handleCreate(): Promise<void> {
    await window.launcher.files.writeText(serverId, configFilePath, DEFAULT_SERVER_PROPERTIES)
    setRaw(DEFAULT_SERVER_PROPERTIES)
    setExists(true)
  }

  async function persist(nextRaw: string): Promise<void> {
    setSaving(true)
    try {
      await window.launcher.files.writeText(serverId, configFilePath, nextRaw)
      setRaw(nextRaw)
      setExists(true)
    } finally {
      setSaving(false)
    }
  }

  function updateField(key: string, value: string): void {
    void persist(updateProperties(raw ?? '', { [key]: value }))
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando...</div>
  }

  if (!exists) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <FileQuestion className="h-8 w-8 opacity-40" />
        <div>
          <p className="text-sm">No se encontró "{configFilePath}" en el directorio del servidor.</p>
          <p className="mt-1 text-xs">Se crea automáticamente la primera vez que arrancas el servidor, o puedes crearlo aquí.</p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          Crear {configFilePath}
        </Button>
      </div>
    )
  }

  const props = parseProperties(raw ?? '')
  const get = (key: string, fallback = ''): string => props.get(key) ?? fallback

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'visual' | 'raw')}>
          <TabsList>
            <TabsTrigger value="visual" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Visual
            </TabsTrigger>
            <TabsTrigger value="raw" className="gap-1.5">
              <Code2 className="h-3.5 w-3.5" /> Texto
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {saving && <span className="text-xs text-muted-foreground">Guardando...</span>}
      </div>

      {isRunning && (
        <p className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          El servidor está en marcha: Minecraft solo lee server.properties al arrancar, así que los cambios se
          aplicarán al reiniciar.
        </p>
      )}

      {mode === 'visual' ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin pr-1">
          <Field label="MOTD">
            <Input defaultValue={get('motd')} onBlur={(e) => updateField('motd', e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Máx. jugadores">
              <Input
                type="number"
                defaultValue={get('max-players', '20')}
                onBlur={(e) => updateField('max-players', e.target.value)}
              />
            </Field>
            <Field label="Puerto">
              <Input
                type="number"
                defaultValue={get('server-port', '25565')}
                onBlur={(e) => updateField('server-port', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Dificultad">
              <Select value={get('difficulty', 'normal')} onValueChange={(v) => updateField('difficulty', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Modo de juego">
              <Select value={get('gamemode', 'survival')} onValueChange={(v) => updateField('gamemode', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GAMEMODES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Semilla del mundo (opcional)">
            <Input defaultValue={get('level-seed')} onBlur={(e) => updateField('level-seed', e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Distancia de renderizado">
              <Input
                type="number"
                defaultValue={get('view-distance', '10')}
                onBlur={(e) => updateField('view-distance', e.target.value)}
              />
            </Field>
            <Field label="Protección del spawn">
              <Input
                type="number"
                defaultValue={get('spawn-protection', '16')}
                onBlur={(e) => updateField('spawn-protection', e.target.value)}
              />
            </Field>
          </div>

          <ToggleRow
            label="PvP habilitado"
            checked={get('pvp', 'true') === 'true'}
            onChange={(v) => updateField('pvp', String(v))}
          />
          <ToggleRow
            label="Whitelist habilitada"
            checked={get('white-list', 'false') === 'true'}
            onChange={(v) => updateField('white-list', String(v))}
          />
          <ToggleRow
            label="Modo online (verifica cuentas de Mojang/Microsoft)"
            checked={get('online-mode', 'true') === 'true'}
            onChange={(v) => updateField('online-mode', String(v))}
          />
          <ToggleRow
            label="Bloques de comandos"
            checked={get('enable-command-block', 'false') === 'true'}
            onChange={(v) => updateField('enable-command-block', String(v))}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
          <Editor
            language="ini"
            value={raw ?? ''}
            theme="vs-dark"
            onChange={(v) => setRaw(v ?? '')}
            options={{
              fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2
            }}
          />
          <div className="flex justify-end border-t border-border bg-card/60 px-3 py-2">
            <Button size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => raw !== null && persist(raw)}>
              <Save className="h-3.5 w-3.5" /> Guardar
            </Button>
          </div>
        </div>
      )}
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

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
