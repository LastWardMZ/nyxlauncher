import { motion } from 'framer-motion'
import { Cpu, MemoryStick, Play, RotateCw, Square, Timer } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { StatusBadge } from '@renderer/components/StatusBadge'
import { cn } from '@renderer/lib/utils'
import { formatMemory, formatUptime } from '@renderer/lib/utils'
import { useServerStore } from '@renderer/store/serverStore'
import type { ServerConfig, ServerRuntimeState } from '@shared/types'

interface ServerCardProps {
  server: ServerConfig
  runtime: ServerRuntimeState | undefined
  onOpen: () => void
}

export function ServerCard({ server, runtime, onOpen }: ServerCardProps): JSX.Element {
  const startServer = useServerStore((s) => s.startServer)
  const stopServer = useServerStore((s) => s.stopServer)
  const restartServer = useServerStore((s) => s.restartServer)
  const status = runtime?.status ?? 'stopped'
  const isRunning = status === 'online' || status === 'starting'
  const cpu = runtime?.metrics?.cpuPercent ?? 0
  const cpuHot = isRunning && cpu >= 80

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18 }}
    >
      <Card
        className="group cursor-pointer overflow-hidden transition-colors hover:border-primary/40 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_16px_40px_-16px_hsl(var(--primary)/0.35)]"
        onClick={onOpen}
      >
        <div
          className={cn(
            'h-1 w-full bg-gradient-to-r transition-opacity',
            status === 'online'
              ? 'from-success via-primary to-secondary opacity-90'
              : 'from-primary via-secondary to-accent opacity-50'
          )}
        />
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{server.name}</h3>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {server.launchMode === 'jar' ? 'JVM · ' : ''}
              {server.port ? `puerto ${server.port}` : 'sin puerto configurado'}
            </p>
          </div>
          <StatusBadge status={status} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Stat icon={<Cpu className="h-3.5 w-3.5" />} label="CPU" value={`${cpu}%`} alert={cpuHot} />
            <Stat
              icon={<MemoryStick className="h-3.5 w-3.5" />}
              label="RAM"
              value={formatMemory(runtime?.metrics?.memoryMb ?? 0)}
            />
            <Stat
              icon={<Timer className="h-3.5 w-3.5" />}
              label="Uptime"
              value={isRunning ? formatUptime(runtime?.metrics?.uptimeSeconds ?? 0) : '—'}
            />
          </div>

          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {!isRunning ? (
              <Button size="sm" className="flex-1 gap-1.5" onClick={() => startServer(server.id)}>
                <Play className="h-3.5 w-3.5" /> Iniciar
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={() => stopServer(server.id)}
              >
                <Square className="h-3.5 w-3.5" /> Detener
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={!isRunning}
              onClick={() => restartServer(server.id)}
              title="Reiniciar"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function Stat({
  icon,
  label,
  value,
  alert
}: {
  icon: React.ReactNode
  label: string
  value: string
  alert?: boolean
}): JSX.Element {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'rounded-md border px-2 py-1.5 transition-colors',
        alert ? 'border-destructive/40 bg-destructive/10' : 'border-border/60 bg-muted/20'
      )}
    >
      <div className={cn('flex items-center gap-1', alert ? 'text-destructive' : 'text-muted-foreground')}>
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn('mt-0.5 font-mono text-sm font-medium', alert ? 'text-destructive' : 'text-foreground')}>
        {value}
      </div>
    </motion.div>
  )
}
