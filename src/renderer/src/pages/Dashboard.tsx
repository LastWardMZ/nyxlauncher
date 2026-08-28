import { motion } from 'framer-motion'
import { Server as ServerIcon } from 'lucide-react'
import { ServerCard } from '@renderer/components/ServerCard'
import { AddServerButton } from '@renderer/components/Sidebar'
import { useServerStore } from '@renderer/store/serverStore'

interface DashboardProps {
  onOpenServer: (id: string) => void
  onAddServer: () => void
}

export function Dashboard({ onOpenServer, onAddServer }: DashboardProps): JSX.Element {
  const servers = useServerStore((s) => s.servers)
  const runtime = useServerStore((s) => s.runtime)

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Tus servidores</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Administra, arranca y monitoriza tus servidores de Minecraft.
            </p>
          </div>
          {servers.length > 0 && <AddServerButton onClick={onAddServer} />}
        </div>

        {servers.length === 0 ? (
          <EmptyState onAddServer={onAddServer} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                runtime={runtime[server.id]}
                onOpen={() => onOpenServer(server.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ onAddServer }: { onAddServer: () => void }): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-grid-fade px-6 py-24 text-center"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/30">
        <ServerIcon className="h-6 w-6 text-primary" />
      </div>
      <h2 className="text-lg font-semibold">Aún no tienes servidores</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Descarga Paper, Purpur o Velocity directamente desde aquí, o apunta a un .jar que ya tengas. Podrás
        iniciarlo y ver su consola en tiempo real.
      </p>
      <div className="mt-6">
        <AddServerButton onClick={onAddServer} />
      </div>
    </motion.div>
  )
}
