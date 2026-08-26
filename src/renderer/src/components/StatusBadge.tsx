import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import type { ServerStatus } from '@shared/types'

const CONFIG: Record<ServerStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted'; dot: string }> = {
  online: { label: 'En línea', variant: 'success', dot: 'bg-success' },
  starting: { label: 'Iniciando', variant: 'warning', dot: 'bg-warning' },
  stopping: { label: 'Deteniendo', variant: 'warning', dot: 'bg-warning' },
  stopped: { label: 'Detenido', variant: 'muted', dot: 'bg-muted-foreground' },
  crashed: { label: 'Error', variant: 'destructive', dot: 'bg-destructive' },
  error: { label: 'Error', variant: 'destructive', dot: 'bg-destructive' }
}

export function StatusBadge({ status }: { status: ServerStatus }): JSX.Element {
  const cfg = CONFIG[status]
  const pulsing = status === 'starting' || status === 'stopping'
  return (
    <Badge variant={cfg.variant}>
      <span className="relative flex h-1.5 w-1.5">
        {pulsing && (
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', cfg.dot)} />
        )}
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', cfg.dot)} />
      </span>
      {cfg.label}
    </Badge>
  )
}
