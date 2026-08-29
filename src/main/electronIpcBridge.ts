import { ipcMain } from 'electron'
import { allHandlers } from './remoteBridge'

/** Desktop-only: wires every handler already registered in remoteBridge.ts's
 *  registry onto Electron's real `ipcMain`, so the local renderer (loaded
 *  via the preload contextBridge) can call them the normal Electron way.
 *  Call once, after `registerIpcHandlers()` has populated the registry —
 *  never imported/called from the headless core, which only ever reaches
 *  these handlers through remoteServer.ts's HTTP bridge. */
export function wireElectronIpc(): void {
  for (const [channel, handler] of allHandlers()) {
    ipcMain.handle(channel, handler)
  }
}
