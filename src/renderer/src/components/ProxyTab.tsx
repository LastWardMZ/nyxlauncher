import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useServerStore } from '@renderer/store/serverStore'
import type { ProxyBackendEntry, ServerConfig } from '@shared/types'

export function ProxyTab({ server }: { server: ServerConfig }): JSX.Element {
  const otherServers = useServerStore((s) => s.servers.filter((x) => x.id !== server.id && x.flavor !== 'velocity'))

  const [loading, setLoading] = useState(true)
  const [exists, setExists] = useState(true)
  const [servers, setServers] = useState<ProxyBackendEntry[]>([])
  const [tryOrder, setTryOrder] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [pickExisting, setPickExisting] = useState('')

  async function load(): Promise<void> {
    setLoading(true)
    const config = await window.launcher.proxy.getConfig(server.id)
    setExists(config.exists)
    setServers(config.servers)
    setTryOrder(config.tryOrder)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id])

  async function persist(nextServers: ProxyBackendEntry[], nextTry: string[]): Promise<void> {
    setSaving(true)
    try {
      await window.launcher.proxy.saveConfig(server.id, nextServers, nextTry)
      setServers(nextServers)
      setTryOrder(nextTry)
      setExists(true)
    } finally {
      setSaving(false)
    }
  }

  function handleAddExisting(): void {
    const picked = otherServers.find((s) => s.id === pickExisting)
    if (!picked) return
    const name = picked.name.toLowerCase().replace(/\s+/g, '-')
    const address = `127.0.0.1:${picked.port ?? 25565}`
    if (servers.some((s) => s.name === name)) return
    void persist([...servers, { name, address }], [...tryOrder, name])
    setPickExisting('')
  }

  function handleAddManual(): void {
    if (!newName.trim() || !newAddress.trim()) return
    if (servers.some((s) => s.name === newName.trim())) return
    void persist([...servers, { name: newName.trim(), address: newAddress.trim() }], [...tryOrder, newName.trim()])
    setNewName('')
    setNewAddress('')
  }

  function handleRemove(name: string): void {
    void persist(
      servers.filter((s) => s.name !== name),
      tryOrder.filter((n) => n !== name)
    )
  }

  function moveTry(name: string, direction: -1 | 1): void {
    const idx = tryOrder.indexOf(name)
    const next = idx + direction
    if (idx === -1 || next < 0 || next >= tryOrder.length) return
    const reordered = [...tryOrder]
    ;[reordered[idx], reordered[next]] = [reordered[next], reordered[idx]]
    void persist(servers, reordered)
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando...</div>
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-thin sm:grid sm:grid-cols-2 sm:overflow-hidden">
      <div className="min-h-0 space-y-4 sm:overflow-y-auto sm:scrollbar-thin sm:pr-1">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Añadir servidor backend</CardTitle>
            <p className="text-xs text-muted-foreground">
              Regis­tra un servidor en velocity.toml para que este proxy pueda enviarle jugadores.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {otherServers.length > 0 && (
              <div className="space-y-1.5">
                <Label>Desde tus servidores</Label>
                <div className="flex gap-2">
                  <Select value={pickExisting} onValueChange={setPickExisting}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elige un servidor" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherServers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!pickExisting} onClick={handleAddExisting}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>O manualmente (servidor externo)</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input placeholder="nombre" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input
                  placeholder="host:puerto"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                />
                <Button size="icon" disabled={!newName.trim() || !newAddress.trim()} onClick={handleAddManual}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {!exists && (
              <p className="text-[11px] text-muted-foreground">
                Aún no existe velocity.toml en esta carpeta — se creará con estos valores al guardar.
              </p>
            )}
            {saving && <p className="text-[11px] text-muted-foreground">Guardando...</p>}
          </CardContent>
        </Card>
      </div>

      <div className="min-h-0 sm:overflow-y-auto sm:scrollbar-thin sm:pr-1">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Save className="h-4 w-4" /> Servidores registrados
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Orden de prioridad para enviar jugadores nuevos (arriba = primero).
            </p>
          </CardHeader>
          <CardContent>
            {tryOrder.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin servidores registrados todavía</p>
            ) : (
              <ul className="space-y-1.5">
                {tryOrder.map((name, i) => {
                  const entry = servers.find((s) => s.name === name)
                  return (
                    <li
                      key={name}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{entry?.address}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={i === 0}
                          onClick={() => moveTry(name, -1)}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={i === tryOrder.length - 1}
                          onClick={() => moveTry(name, 1)}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleRemove(name)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
