import { create } from 'zustand'
import type {
  ConsoleLine,
  CreateServerInput,
  ServerConfig,
  ServerRuntimeState,
  UpdateServerInput
} from '@shared/types'

const CONSOLE_LINES_KEPT = 3000

// Stable reference so selectors like `consoleLines[id] ?? EMPTY_LINES` don't hand
// useSyncExternalStore a fresh array every render — a new reference each call makes
// it think the snapshot never stabilizes, which throws "Maximum update depth
// exceeded" (React error #185) for any server with no console lines yet.
export const EMPTY_LINES: ConsoleLine[] = []

interface ServerStoreState {
  servers: ServerConfig[]
  runtime: Record<string, ServerRuntimeState>
  consoleLines: Record<string, ConsoleLine[]>
  selectedServerId: string | null
  loaded: boolean

  init: () => Promise<void>
  selectServer: (id: string | null) => void
  createServer: (input: CreateServerInput) => Promise<ServerConfig>
  updateServer: (input: UpdateServerInput) => Promise<void>
  deleteServer: (id: string) => Promise<void>
  startServer: (id: string) => Promise<void>
  stopServer: (id: string) => Promise<void>
  killServer: (id: string) => Promise<void>
  restartServer: (id: string) => Promise<void>
  sendCommand: (id: string, command: string) => Promise<void>
  clearConsole: (id: string) => void
}

export const useServerStore = create<ServerStoreState>((set) => ({
  servers: [],
  runtime: {},
  consoleLines: {},
  selectedServerId: null,
  loaded: false,

  init: async () => {
    const [servers] = await Promise.all([window.launcher.servers.list()])
    const runtimeEntries = await Promise.all(
      servers.map(async (s) => [s.id, await window.launcher.server.getState(s.id)] as const)
    )
    const bufferEntries = await Promise.all(
      servers.map(async (s) => [s.id, await window.launcher.server.getConsoleBuffer(s.id)] as const)
    )

    window.launcher.events.onConsoleLine((line) => {
      set((state) => {
        const existing = state.consoleLines[line.serverId] ?? []
        const next = [...existing, line]
        if (next.length > CONSOLE_LINES_KEPT) next.splice(0, next.length - CONSOLE_LINES_KEPT)
        return { consoleLines: { ...state.consoleLines, [line.serverId]: next } }
      })
    })

    window.launcher.events.onStateChanged((runtimeState) => {
      set((state) => ({ runtime: { ...state.runtime, [runtimeState.id]: runtimeState } }))
    })

    set({
      servers,
      runtime: Object.fromEntries(runtimeEntries),
      consoleLines: Object.fromEntries(bufferEntries),
      loaded: true,
      selectedServerId: servers[0]?.id ?? null
    })
  },

  selectServer: (id) => set({ selectedServerId: id }),

  createServer: async (input) => {
    const created = await window.launcher.servers.create(input)
    set((state) => ({ servers: [...state.servers, created], selectedServerId: created.id }))
    return created
  },

  updateServer: async (input) => {
    const updated = await window.launcher.servers.update(input)
    set((state) => ({ servers: state.servers.map((s) => (s.id === updated.id ? updated : s)) }))
  },

  deleteServer: async (id) => {
    await window.launcher.servers.remove(id)
    set((state) => {
      const servers = state.servers.filter((s) => s.id !== id)
      const selectedServerId = state.selectedServerId === id ? (servers[0]?.id ?? null) : state.selectedServerId
      return { servers, selectedServerId }
    })
  },

  startServer: async (id) => {
    await window.launcher.server.start(id)
  },
  stopServer: async (id) => {
    await window.launcher.server.stop(id)
  },
  killServer: async (id) => {
    await window.launcher.server.kill(id)
  },
  restartServer: async (id) => {
    await window.launcher.server.restart(id)
  },
  sendCommand: async (id, command) => {
    if (!command.trim()) return
    await window.launcher.server.sendCommand(id, command)
  },
  clearConsole: (id) => {
    set((state) => ({ consoleLines: { ...state.consoleLines, [id]: [] } }))
  }
}))

if (import.meta.env.DEV) {
  ;(window as unknown as { __store: typeof useServerStore }).__store = useServerStore
}

export function getServerById(id: string | null): ServerConfig | undefined {
  if (!id) return undefined
  return useServerStore.getState().servers.find((s) => s.id === id)
}
