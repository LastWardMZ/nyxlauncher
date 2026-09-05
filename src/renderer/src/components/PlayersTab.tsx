import { useMemo } from 'react'
import { ShieldOff, Sword, UserMinus, UserPlus, Users } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { PlayerListFileEditor } from '@renderer/components/PlayerListFileEditor'
import { EMPTY_LINES, useServerStore } from '@renderer/store/serverStore'
import { deriveConnectedPlayers } from '@renderer/lib/playerParser'
import type { ServerConfig } from '@shared/types'

export function PlayersTab({ server }: { server: ServerConfig }): JSX.Element {
  const lines = useServerStore((s) => s.consoleLines[server.id] ?? EMPTY_LINES)
  const status = useServerStore((s) => s.runtime[server.id]?.status ?? 'stopped')
  const sendCommand = useServerStore((s) => s.sendCommand)
  const canAct = status === 'online'

  const players = useMemo(() => deriveConnectedPlayers(lines), [lines])

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-thin sm:grid sm:grid-cols-[1fr_320px] sm:overflow-hidden">
      <div className="min-h-0 sm:overflow-y-auto sm:scrollbar-thin sm:px-1">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" /> Jugadores conectados
            </CardTitle>
            <p className="text-xs text-muted-foreground">Detectados a partir de la consola en tiempo real.</p>
          </CardHeader>
          <CardContent>
            {players.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nadie conectado ahora mismo</p>
            ) : (
              <ul className="space-y-1.5">
                {players.map((name) => (
                  <li
                    key={name}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2"
                  >
                    <span className="font-mono text-sm">{name}</span>
                    <div className="flex items-center gap-1">
                      <ActionButton
                        title="Op"
                        icon={<Sword className="h-3.5 w-3.5" />}
                        disabled={!canAct}
                        onClick={() => sendCommand(server.id, `op ${name}`)}
                      />
                      <ActionButton
                        title="Deop"
                        icon={<ShieldOff className="h-3.5 w-3.5" />}
                        disabled={!canAct}
                        onClick={() => sendCommand(server.id, `deop ${name}`)}
                      />
                      <ActionButton
                        title="Kick"
                        icon={<UserMinus className="h-3.5 w-3.5" />}
                        disabled={!canAct}
                        onClick={() => sendCommand(server.id, `kick ${name}`)}
                      />
                      <ActionButton
                        title="Ban"
                        icon={<UserPlus className="h-3.5 w-3.5 rotate-180" />}
                        danger
                        disabled={!canAct}
                        onClick={() => sendCommand(server.id, `ban ${name}`)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="min-h-0 space-y-4 sm:overflow-y-auto sm:scrollbar-thin sm:px-1">
        <PlayerListFileEditor
          serverId={server.id}
          title="Whitelist"
          description="Jugadores con acceso cuando la whitelist está activa."
          relPath={server.playerListFiles.whitelist}
        />
        <PlayerListFileEditor
          serverId={server.id}
          title="Operadores"
          description="Jugadores con permisos de administrador."
          relPath={server.playerListFiles.ops}
        />
        <PlayerListFileEditor
          serverId={server.id}
          title="Baneados"
          description="Jugadores bloqueados para entrar al servidor."
          relPath={server.playerListFiles.banned}
        />
      </div>
    </div>
  )
}

function ActionButton({
  title,
  icon,
  danger,
  disabled,
  onClick
}: {
  title: string
  icon: React.ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <Button
      size="icon"
      variant="ghost"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`h-7 w-7 ${danger ? 'text-destructive hover:bg-destructive/10 hover:text-destructive' : ''}`}
    >
      {icon}
    </Button>
  )
}
