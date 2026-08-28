import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu } from 'lucide-react'
import { Sidebar } from '@renderer/components/Sidebar'
import { AddServerDialog } from '@renderer/components/AddServerDialog'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { Dashboard } from '@renderer/pages/Dashboard'
import { ServerDetail } from '@renderer/pages/ServerDetail'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { useServerStore } from '@renderer/store/serverStore'

type View = { kind: 'dashboard' } | { kind: 'server'; id: string } | { kind: 'settings' }

function App(): JSX.Element {
  const init = useServerStore((s) => s.init)
  const loaded = useServerStore((s) => s.loaded)
  const [view, setView] = useState<View>({ kind: 'dashboard' })
  const [addOpen, setAddOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!loaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background bg-grid-fade">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative flex h-14 w-14 items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-2xl border-2 border-primary/25 border-t-primary"
            />
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-base font-bold text-primary-foreground shadow-[0_0_20px_-2px_hsl(var(--primary)/0.7)]">
              N
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Cargando launcher...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background bg-grid-fade">
      <Sidebar
        view={view.kind}
        onSelectDashboard={() => setView({ kind: 'dashboard' })}
        onSelectServer={(id) => setView({ kind: 'server', id })}
        onSelectSettings={() => setView({ kind: 'settings' })}
        onAddServer={() => setAddOpen(true)}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="glass flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-semibold tracking-tight">NyxLauncher</span>
        </header>

        <main className="min-h-0 min-w-0 flex-1">
          <ErrorBoundary
            key={view.kind === 'server' ? `server-${view.id}` : view.kind}
            onReset={() => setView({ kind: 'dashboard' })}
          >
            <AnimatePresence mode="wait">
              {view.kind === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  <Dashboard onOpenServer={(id) => setView({ kind: 'server', id })} onAddServer={() => setAddOpen(true)} />
                </motion.div>
              )}
              {view.kind === 'server' && (
                <motion.div
                  key={`server-${view.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  <ServerDetail serverId={view.id} onDeleted={() => setView({ kind: 'dashboard' })} />
                </motion.div>
              )}
              {view.kind === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  <SettingsPage />
                </motion.div>
              )}
            </AnimatePresence>
          </ErrorBoundary>
        </main>
      </div>

      <AddServerDialog open={addOpen} onOpenChange={setAddOpen} onCreated={(id) => setView({ kind: 'server', id })} />
    </div>
  )
}

export default App
