import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Cpu, MemoryStick, Play, Power, RotateCw, Square, Timer, Trash2, Users } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { StatusBadge } from '@renderer/components/StatusBadge'
import { Console } from '@renderer/components/Console'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { ResourceSparkline } from '@renderer/components/ResourceSparkline'
import { ConfigTab } from '@renderer/components/ConfigTab'
import { AnalyticsTab } from '@renderer/components/AnalyticsTab'
import { FilesTab } from '@renderer/components/FilesTab'
import { PlayersTab } from '@renderer/components/PlayersTab'
import { BackupsTab } from '@renderer/components/BackupsTab'
import { BuildUpdatePill } from '@renderer/components/BuildUpdatePill'
import { ProxyTab } from '@renderer/components/ProxyTab'
import { ContentTab } from '@renderer/components/ContentTab'
import { MapTab } from '@renderer/components/MapTab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { formatMemory, formatUptime } from '@renderer/lib/utils'
import { deriveConnectedPlayers } from '@renderer/lib/playerParser'
import { EMPTY_LINES, useServerStore } from '@renderer/store/serverStore'
import { FLAVOR_CATEGORY, FLAVOR_CONTENT_TYPE } from '@shared/types'

interface ServerDetailProps {
  serverId: string
  onDeleted: () => void
}

export function ServerDetail({ serverId, onDeleted }: ServerDetailProps): JSX.Element | null {
  const server = useServerStore((s) => s.servers.find((x) => x.id === serverId))
  const runtime = useServerStore((s) => s.runtime[serverId])
  const lines = useServerStore((s) => s.consoleLines[serverId] ?? EMPTY_LINES)
  const startServer = useServerStore((s) => s.startServer)
  const stopServer = useServerStore((s) => s.stopServer)
  const killServer = useServerStore((s) => s.killServer)
  const restartServer = useServerStore((s) => s.restartServer)
  const sendCommand = useServerStore((s) => s.sendCommand)
  const clearConsole = useServerStore((s) => s.clearConsole)
  const deleteServer = useServerStore((s) => s.deleteServer)

  const [confirmKill, setConfirmKill] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const playersOnline = useMemo(() => deriveConnectedPlayers(lines).length, [lines])

  if (!server) return null

  const status = runtime?.status ?? 'stopped'
  const isRunning = status === 'online' || status === 'starting'
  const canSendCommand = status === 'online'
  const showMapTab =
    FLAVOR_CATEGORY[server.flavor] === 'server' && (FLAVOR_CONTENT_TYPE[server.flavor] !== undefined || server.flavor === 'vanilla')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass flex items-center justify-between gap-4 border-b border-border px-6 py-4"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-lg font-semibold tracking-tight">{server.name}</h1>
            <StatusBadge status={status} />
            <BuildUpdatePill server={server} />
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{server.workingDirectory}</p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden items-center gap-4 md:flex">
            <MetricBlock
              icon={<Cpu className="h-3.5 w-3.5" />}
              label="CPU"
              value={`${runtime?.metrics?.cpuPercent ?? 0}%`}
              sparkline={<ResourceSparkline value={runtime?.metrics?.cpuPercent ?? 0} color="primary" />}
            />
            <MetricBlock
              icon={<MemoryStick className="h-3.5 w-3.5" />}
              label="RAM"
              value={formatMemory(runtime?.metrics?.memoryMb ?? 0)}
              sparkline={<ResourceSparkline value={runtime?.metrics?.memoryMb ?? 0} color="secondary" />}
            />
            <MetricBlock
              icon={<Timer className="h-3.5 w-3.5" />}
              label="Uptime"
              value={isRunning ? formatUptime(runtime?.metrics?.uptimeSeconds ?? 0) : '—'}
            />
            <MetricBlock
              icon={<Users className="h-3.5 w-3.5" />}
              label="Jugadores"
              value={status === 'online' ? String(playersOnline) : '—'}
            />
          </div>

          <div className="flex items-center gap-2">
            {!isRunning ? (
              <Button size="sm" className="gap-1.5" onClick={() => startServer(server.id)}>
                <Play className="h-3.5 w-3.5" /> Iniciar
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => stopServer(server.id)}>
                <Square className="h-3.5 w-3.5" /> Detener
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={!isRunning} onClick={() => restartServer(server.id)} title="Reiniciar">
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!isRunning}
              onClick={() => setConfirmKill(true)}
              title="Forzar cierre"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Power className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              title="Eliminar servidor"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="min-h-0 flex-1 px-6 py-4">
        <Tabs defaultValue="console" className="flex h-full flex-col">
          <TabsList>
            <TabsTrigger value="console">Consola</TabsTrigger>
            <TabsTrigger value="analytics">Analítica</TabsTrigger>
            <TabsTrigger value="config">Configuración</TabsTrigger>
            <TabsTrigger value="content">Contenido</TabsTrigger>
            {showMapTab && <TabsTrigger value="map">Mapa</TabsTrigger>}
            <TabsTrigger value="files">Archivos</TabsTrigger>
            <TabsTrigger value="players">Jugadores</TabsTrigger>
            <TabsTrigger value="backups">Backups</TabsTrigger>
            {server.flavor === 'velocity' && <TabsTrigger value="proxy">Proxy</TabsTrigger>}
          </TabsList>
          <TabsContent value="console" className="min-h-0 flex-1">
            <Console
              serverId={server.id}
              lines={lines}
              canSendCommand={canSendCommand}
              onSendCommand={(cmd) => sendCommand(server.id, cmd)}
              onClear={() => clearConsole(server.id)}
            />
          </TabsContent>
          <TabsContent
            value="analytics"
            className="min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
          >
            <AnalyticsTab server={server} />
          </TabsContent>
          <TabsContent value="config" className="min-h-0 flex-1">
            <ConfigTab server={server} />
          </TabsContent>
          <TabsContent value="content" className="min-h-0 flex-1">
            <ContentTab server={server} />
          </TabsContent>
          {showMapTab && (
            <TabsContent
              value="map"
              className="min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
            >
              <MapTab server={server} />
            </TabsContent>
          )}
          <TabsContent value="files" className="min-h-0 flex-1">
            <FilesTab serverId={server.id} />
          </TabsContent>
          <TabsContent value="players" className="min-h-0 flex-1">
            <PlayersTab server={server} />
          </TabsContent>
          <TabsContent value="backups" className="min-h-0 flex-1">
            <BackupsTab server={server} />
          </TabsContent>
          {server.flavor === 'velocity' && (
            <TabsContent value="proxy" className="min-h-0 flex-1">
              <ProxyTab server={server} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <ConfirmDialog
        open={confirmKill}
        onOpenChange={setConfirmKill}
        title="¿Forzar cierre del servidor?"
        description="Esto mata el proceso inmediatamente sin dar tiempo a guardar. Úsalo solo si el servidor no responde."
        confirmLabel="Forzar cierre"
        onConfirm={() => killServer(server.id)}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar este servidor?"
        description="Se eliminará de la lista del launcher. Los archivos del servidor en disco no se borrarán."
        confirmLabel="Eliminar"
        onConfirm={() => {
          deleteServer(server.id)
          onDeleted()
        }}
      />
    </div>
  )
}

function MetricBlock({
  icon,
  label,
  value,
  sparkline
}: {
  icon: React.ReactNode
  label: string
  value: string
  sparkline?: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      {sparkline}
      <div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="font-mono text-sm font-medium">{value}</div>
      </div>
    </div>
  )
}
