import { IPC } from '../shared/types'

// Pure registry, no Electron import — safe to sit in both index.ts's (desktop)
// and coreIndex.ts's (headless/Docker) module graphs. `registerHandler`
// keeps a plain-function copy of every IPC handler here, so the same
// business logic can be invoked from remoteServer.ts's HTTP API for browser
// clients — no handler body is ever duplicated. Handlers keep their
// original `(event, ...args)` signature (every one in ipc.ts is written
// `(_e, arg1, arg2) => ...`, ignoring `_e`), so the desktop build's
// `ipcMain.handle` (see electronIpcBridge.ts) registers them completely
// unchanged, and the HTTP path calls the same function with `undefined`
// standing in for the event — verified no handler reads it (none use
// `event.sender`), except remoteAuthGetStatus, which reads it as an
// InvokeContext to report the calling session's own role back to it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: unknown, ...args: any[]) => unknown

const registry = new Map<string, Handler>()

export function registerHandler(channel: string, handler: Handler): void {
  registry.set(channel, handler)
}

/** Only the desktop build calls this — see electronIpcBridge.ts. Desktop has
 *  no login/session concept at all (it *is* the admin, always), so it always
 *  calls ipcMain.handle directly and never goes through invokeHandler below —
 *  the permission gate in there exists purely for the remote HTTP bridge. */
export function allHandlers(): ReadonlyMap<string, Handler> {
  return registry
}

export interface InvokeContext {
  role: 'admin' | 'operator'
}

// Default-deny: only a channel explicitly listed here is reachable by a
// limited "operator" account over the remote HTTP bridge. Read-only browsing
// plus console commands (the actual day-to-day moderation tool — kick/ban/
// whitelist all happen through it) — nothing that creates/deletes/reconfigures
// a server, touches remote-access settings, or manages other accounts.
const OPERATOR_ALLOWED_CHANNELS = new Set<string>([
  IPC.serversList,
  IPC.serverGetState,
  IPC.serverGetConsoleBuffer,
  IPC.serverGetDiskUsage,
  IPC.serverSendCommand,
  IPC.filesList,
  IPC.filesReadText,
  IPC.backupsList,
  IPC.worldsList,
  IPC.contentSearch,
  IPC.contentGetProject,
  IPC.contentListVersions,
  IPC.contentListInstalled,
  IPC.mapGetStatus,
  IPC.mapGetUrl,
  IPC.mapGetDiskUsage,
  IPC.appGetVersion,
  IPC.configGetDefaults,
  IPC.remoteAuthGetStatus,
  IPC.remoteServerGetStatus,
  IPC.accessLogList
])

export async function invokeHandler(channel: string, args: unknown[], context: InvokeContext): Promise<unknown> {
  const handler = registry.get(channel)
  if (!handler) {
    const err = new Error(`Canal desconocido: ${channel}`)
    err.name = 'UnknownChannelError'
    throw err
  }
  if (context.role === 'operator' && !OPERATOR_ALLOWED_CHANNELS.has(channel)) {
    const err = new Error('Tu cuenta no tiene permiso para hacer esto')
    err.name = 'ForbiddenError'
    throw err
  }
  return handler(context, ...args)
}

export function isKnownChannel(channel: string): boolean {
  return registry.has(channel)
}

// Push-event mirroring: ipc.ts/autoUpdate.ts keep calling
// `getMainWindow()?.webContents.send(channel, payload)` for the desktop
// window unchanged, and additionally call `broadcastToRemote` so any
// connected browser clients (over WebSocket) get the same event.
type RemoteBroadcaster = (channel: string, payload: unknown) => void

let remoteBroadcaster: RemoteBroadcaster | null = null

export function setRemoteBroadcaster(fn: RemoteBroadcaster | null): void {
  remoteBroadcaster = fn
}

export function broadcastToRemote(channel: string, payload: unknown): void {
  remoteBroadcaster?.(channel, payload)
}
