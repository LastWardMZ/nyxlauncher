import { useEffect, useState } from 'react'
import { Globe, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import type { ServerConfig, WorldInfo } from '@shared/types'

export function WorldsTab({ server }: { server: ServerConfig }): JSX.Element {
  const [worlds, setWorlds] = useState<WorldInfo[] | null>(null)
  const [busyName, setBusyName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WorldInfo | null>(null)

  async function load(): Promise<void> {
    try {
      setWorlds(await window.launcher.worlds.list(server.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    setWorlds(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id])

  async function activate(world: WorldInfo): Promise<void> {
    setBusyName(world.name)
    setError(null)
    try {
      await window.launcher.worlds.setActive(server.id, world.name)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyName(null)
    }
  }

  async function remove(world: WorldInfo): Promise<void> {
    setBusyName(world.name)
    setError(null)
    try {
      await window.launcher.worlds.remove(server.id, world.name)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyName(null)
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {worlds ? `${worlds.length} mundo${worlds.length === 1 ? '' : 's'}` : 'Cargando...'}
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Cambiar el mundo activo edita <code>level-name</code> en {server.configFilePath} — reinicia el servidor para
        que aplique.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin px-1">
        {worlds === null && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        {worlds?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No se encontró ningún mundo todavía.</p>
        )}
        {worlds?.map((world) => (
          <div
            key={world.name}
            className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2.5"
          >
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{world.name}</p>
              {(world.hasNether || world.hasEnd) && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {[world.hasNether && 'Nether', world.hasEnd && 'End'].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            {world.isActive ? (
              <Badge variant="success">Activo</Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busyName !== null}
                onClick={() => activate(world)}
              >
                {busyName === world.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Activar'}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              disabled={busyName !== null || world.isActive}
              onClick={() => setDeleteTarget(world)}
              title={world.isActive ? 'No puedes eliminar el mundo activo' : 'Eliminar mundo'}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`¿Eliminar "${deleteTarget?.name}"?`}
        description="Se borra la carpeta del mundo (y su nether/end si los tiene) del disco. No se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => deleteTarget && remove(deleteTarget)}
      />
    </div>
  )
}
