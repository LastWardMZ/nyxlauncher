import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronsLeft, ChevronsRight, LayoutGrid, Plus, Server, Settings } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useServerStore } from '@renderer/store/serverStore'
import { Button } from '@renderer/components/ui/button'
import appIcon from '@renderer/assets/app-icon.png'

interface SidebarProps {
  view: 'dashboard' | 'server' | 'settings'
  onSelectDashboard: () => void
  onSelectServer: (id: string) => void
  onSelectSettings: () => void
  onAddServer: () => void
}

interface HoverRect {
  top: number
  height: number
}

export function Sidebar({
  view,
  onSelectDashboard,
  onSelectServer,
  onSelectSettings,
  onAddServer
}: SidebarProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const servers = useServerStore((s) => s.servers)
  const runtime = useServerStore((s) => s.runtime)
  const selectedServerId = useServerStore((s) => s.selectedServerId)

  const navRef = useRef<HTMLElement>(null)
  const [hoverRect, setHoverRect] = useState<HoverRect | null>(null)

  function reportHover(el: HTMLElement | null): void {
    if (!el || !navRef.current) {
      setHoverRect(null)
      return
    }
    const itemRect = el.getBoundingClientRect()
    const containerRect = navRef.current.getBoundingClientRect()
    setHoverRect({ top: itemRect.top - containerRect.top + navRef.current.scrollTop, height: itemRect.height })
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 264 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className="glass relative z-10 flex h-full flex-col border-r border-border"
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <img
          src={appIcon}
          alt=""
          className="h-7 w-7 shrink-0 drop-shadow-[0_0_16px_hsl(var(--primary)/0.5)]"
        />
        {!collapsed && (
          <span className="truncate text-sm font-semibold tracking-tight">NyxLauncher</span>
        )}
      </div>

      <nav
        ref={navRef}
        onMouseLeave={() => setHoverRect(null)}
        className="relative flex-1 overflow-y-auto scrollbar-thin px-2 py-3"
      >
        <AnimatePresence>
          {hoverRect && (
            <motion.div
              className="pointer-events-none absolute left-1 right-1 z-0 rounded-md bg-muted/60"
              initial={false}
              animate={{ top: hoverRect.top, height: hoverRect.height, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
        </AnimatePresence>

        <SidebarItem
          icon={<LayoutGrid className="h-4 w-4" />}
          label="Dashboard"
          active={view === 'dashboard'}
          collapsed={collapsed}
          onClick={onSelectDashboard}
          onHover={reportHover}
        />

        <div className="relative mt-4">
          {!collapsed && (
            <div className="mb-1 flex items-center justify-between px-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Servidores
              </span>
              <button
                onClick={onAddServer}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                title="Añadir servidor"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {servers.length === 0 && !collapsed && (
            <button
              onClick={onAddServer}
              className="mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Añadir tu primer servidor
            </button>
          )}

          {servers.map((s) => (
            <SidebarItem
              key={s.id}
              icon={<Server className="h-4 w-4" />}
              label={s.name}
              active={view === 'server' && selectedServerId === s.id}
              collapsed={collapsed}
              onClick={() => onSelectServer(s.id)}
              onHover={reportHover}
              trailing={
                collapsed ? undefined : (
                  <StatusDot status={runtime[s.id]?.status ?? 'stopped'} />
                )
              }
            />
          ))}
        </div>
      </nav>

      <div className="border-t border-border p-2">
        <SidebarItem
          icon={<Settings className="h-4 w-4" />}
          label="Ajustes"
          active={view === 'settings'}
          collapsed={collapsed}
          onClick={onSelectSettings}
        />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && 'Colapsar'}
        </button>
      </div>
    </motion.aside>
  )
}

function StatusDot({ status }: { status: string }): JSX.Element {
  const color =
    status === 'online'
      ? 'bg-success'
      : status === 'starting' || status === 'stopping'
        ? 'bg-warning'
        : status === 'crashed' || status === 'error'
          ? 'bg-destructive'
          : 'bg-muted-foreground/50'
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', color)} />
}

function SidebarItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
  trailing,
  onHover
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  collapsed: boolean
  onClick: () => void
  trailing?: React.ReactNode
  onHover?: (el: HTMLElement | null) => void
}): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null)

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => onHover?.(ref.current)}
      title={collapsed ? label : undefined}
      className={cn(
        'group relative z-10 mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        collapsed && 'justify-center'
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-indicator"
          className="absolute inset-0 rounded-md bg-primary/12"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        />
      )}
      {active && (
        <motion.span
          layoutId="sidebar-active-bar"
          className="absolute left-0 top-1 h-[calc(100%-8px)] w-0.5 rounded-full bg-primary"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        />
      )}
      <span className={cn('relative shrink-0', active && 'text-primary')}>{icon}</span>
      {!collapsed && <span className="relative flex-1 truncate text-left">{label}</span>}
      {!collapsed && <span className="relative">{trailing}</span>}
    </button>
  )
}

export function AddServerButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <Button onClick={onClick} size="sm" className="gap-1.5">
      <Plus className="h-4 w-4" /> Añadir servidor
    </Button>
  )
}
