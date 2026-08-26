import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'

interface PlayerListFileEditorProps {
  serverId: string
  title: string
  description: string
  relPath: string
}

type ListState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'unsupported'; raw: string }
  | { kind: 'ready'; names: string[] }

export function PlayerListFileEditor({ serverId, title, description, relPath }: PlayerListFileEditorProps): JSX.Element {
  const [state, setState] = useState<ListState>({ kind: 'loading' })
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  async function load(): Promise<void> {
    setState({ kind: 'loading' })
    const result = await window.launcher.files.readText(serverId, relPath)
    if (result === null) {
      setState({ kind: 'missing' })
      return
    }
    try {
      const parsed = JSON.parse(result.content)
      if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) {
        setState({ kind: 'ready', names: parsed })
      } else {
        setState({ kind: 'unsupported', raw: result.content })
      }
    } catch {
      setState({ kind: 'unsupported', raw: result.content })
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, relPath])

  async function persist(names: string[]): Promise<void> {
    setSaving(true)
    try {
      await window.launcher.files.writeText(serverId, relPath, JSON.stringify(names, null, 2) + '\n')
      setState({ kind: 'ready', names })
    } finally {
      setSaving(false)
    }
  }

  async function handleCreate(): Promise<void> {
    await persist([])
  }

  async function handleAdd(): Promise<void> {
    if (!newName.trim() || state.kind !== 'ready') return
    if (state.names.includes(newName.trim())) {
      setNewName('')
      return
    }
    await persist([...state.names, newName.trim()])
    setNewName('')
  }

  async function handleRemove(name: string): Promise<void> {
    if (state.kind !== 'ready') return
    await persist(state.names.filter((n) => n !== name))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
        <p className="font-mono text-[11px] text-muted-foreground/70">{relPath}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {state.kind === 'loading' && <p className="text-xs text-muted-foreground">Cargando...</p>}

        {state.kind === 'missing' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Este archivo no existe todavía.</p>
            <Button size="sm" variant="outline" onClick={handleCreate}>
              Crear {relPath}
            </Button>
          </div>
        )}

        {state.kind === 'unsupported' && (
          <p className="text-xs text-muted-foreground">
            El contenido no es una lista JSON de nombres simple, edítalo desde la pestaña Archivos.
          </p>
        )}

        {state.kind === 'ready' && (
          <>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Nombre de jugador"
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-8 gap-1 px-2" disabled={saving} onClick={handleAdd}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {state.names.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">Lista vacía</p>
            ) : (
              <ul className="space-y-1">
                {state.names.map((name) => (
                  <li
                    key={name}
                    className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5 text-sm"
                  >
                    <span className="truncate font-mono text-xs">{name}</span>
                    <button
                      onClick={() => handleRemove(name)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Quitar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
