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
// `event.sender`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: unknown, ...args: any[]) => unknown

const registry = new Map<string, Handler>()

export function registerHandler(channel: string, handler: Handler): void {
  registry.set(channel, handler)
}

/** Only the desktop build calls this — see electronIpcBridge.ts. */
export function allHandlers(): ReadonlyMap<string, Handler> {
  return registry
}

export async function invokeHandler(channel: string, args: unknown[]): Promise<unknown> {
  const handler = registry.get(channel)
  if (!handler) {
    const err = new Error(`Canal desconocido: ${channel}`)
    err.name = 'UnknownChannelError'
    throw err
  }
  return handler(undefined, ...args)
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
