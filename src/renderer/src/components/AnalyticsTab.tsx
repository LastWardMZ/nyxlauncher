import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Cpu, HardDrive, MemoryStick, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { useServerStore } from '@renderer/store/serverStore'
import { cn, formatBytes, formatMemory, formatUptime } from '@renderer/lib/utils'
import type { DiskUsageInfo, ServerConfig } from '@shared/types'

const HISTORY_LENGTH = 60 // ~2 minutes of samples at the 2s metrics poll cadence
const DISK_AUTO_REFRESH_MS = 30000

interface Sample {
  t: number
  cpu: number
  mem: number
}

export function AnalyticsTab({ server }: { server: ServerConfig }): JSX.Element {
  const runtime = useServerStore((s) => s.runtime[server.id])
  const status = runtime?.status ?? 'stopped'
  const isRunning = status === 'online' || status === 'starting'
  const cpuPercent = runtime?.metrics?.cpuPercent ?? 0
  const memoryMb = runtime?.metrics?.memoryMb ?? 0
  const uptimeSeconds = runtime?.metrics?.uptimeSeconds ?? 0

  const [history, setHistory] = useState<Sample[]>([])
  const [disk, setDisk] = useState<DiskUsageInfo | null>(null)
  const [diskLoading, setDiskLoading] = useState(false)
  const [diskError, setDiskError] = useState<string | null>(null)
  const [diskUpdatedAt, setDiskUpdatedAt] = useState<number | null>(null)

  useEffect(() => {
    setHistory((h) => [...h.slice(-(HISTORY_LENGTH - 1)), { t: Date.now(), cpu: cpuPercent, mem: memoryMb }])
    // Only the metrics snapshot itself should drive a new sample, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime?.metrics])

  async function loadDisk(): Promise<void> {
    setDiskLoading(true)
    setDiskError(null)
    try {
      setDisk(await window.launcher.server.getDiskUsage(server.id))
      setDiskUpdatedAt(Date.now())
    } catch (e) {
      setDiskError((e as Error).message)
    } finally {
      setDiskLoading(false)
    }
  }

  useEffect(() => {
    void loadDisk()
    const interval = setInterval(() => void loadDisk(), DISK_AUTO_REFRESH_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id])

  const driveUsedBytes =
    disk?.driveTotalBytes != null && disk.driveFreeBytes != null ? disk.driveTotalBytes - disk.driveFreeBytes : null
  const drivePct =
    disk?.driveTotalBytes && driveUsedBytes != null ? Math.min(100, Math.round((driveUsedBytes / disk.driveTotalBytes) * 100)) : null

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-thin pr-1">
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={<Cpu className="h-4 w-4" />}
          label="CPU"
          value={`${cpuPercent}%`}
          sub={isRunning ? `En marcha desde hace ${formatUptime(uptimeSeconds)}` : 'Servidor detenido'}
        />
        <StatCard
          icon={<MemoryStick className="h-4 w-4" />}
          label="Memoria RAM"
          value={formatMemory(memoryMb)}
          sub={isRunning ? 'En uso ahora mismo' : 'Servidor detenido'}
        />
        <StatCard
          icon={<HardDrive className="h-4 w-4" />}
          label="Almacenamiento"
          value={disk ? formatBytes(disk.workingDirectoryBytes) : '—'}
          sub="Tamaño de la carpeta del servidor"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ChartCard title="Uso de CPU" color="primary" dataKey="cpu" unit="%" data={history} domain={[0, 100]} />
        <ChartCard title="Uso de RAM" color="secondary" dataKey="mem" unit=" MB" data={history} domain={[0, 'auto']} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <HardDrive className="h-4 w-4" /> Almacenamiento en disco
          </CardTitle>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={loadDisk} disabled={diskLoading}>
            <RefreshCw className={cn('h-3.5 w-3.5', diskLoading && 'animate-spin')} /> Actualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {diskError && <p className="text-sm text-destructive">{diskError}</p>}
          {!disk && !diskError && <p className="text-sm text-muted-foreground">Calculando el tamaño de la carpeta...</p>}
          {disk && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Carpeta del servidor</span>
                <span className="font-mono">{formatBytes(disk.workingDirectoryBytes)}</span>
              </div>
              {disk.driveTotalBytes != null && disk.driveFreeBytes != null && driveUsedBytes != null && drivePct != null && (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${drivePct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {formatBytes(driveUsedBytes)} usados de {formatBytes(disk.driveTotalBytes)} en la unidad
                    </span>
                    <span>{formatBytes(disk.driveFreeBytes)} libres</span>
                  </div>
                </>
              )}
              {diskUpdatedAt && (
                <p className="text-[11px] text-muted-foreground">
                  Actualizado a las {new Date(diskUpdatedAt).toLocaleTimeString()} · se refresca solo cada 30s
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}): JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/40 text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-lg font-semibold leading-tight">{value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ChartCard({
  title,
  color,
  dataKey,
  unit,
  data,
  domain
}: {
  title: string
  color: 'primary' | 'secondary'
  dataKey: 'cpu' | 'mem'
  unit: string
  data: Sample[]
  domain: [number, number | 'auto']
}): JSX.Element {
  const strokeColor = color === 'primary' ? 'hsl(258 90% 66%)' : 'hsl(199 89% 58%)'
  const gradientId = `analytics-${dataKey}`
  const latest = data.length > 0 ? data[data.length - 1][dataKey] : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span>{title}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {latest}
            {unit}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="h-48 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.4} />
                <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis domain={domain} width={36} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12
              }}
              labelFormatter={() => ''}
              formatter={(value: number) => [`${value}${unit}`, title]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={strokeColor}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
