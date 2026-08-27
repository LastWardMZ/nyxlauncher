import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC } from '../shared/types'

const { autoUpdater } = electronUpdater
import type { AppUpdateStatus } from '../shared/types'
import { notify } from './notifications'
import { broadcastToRemote } from './remoteBridge'

const CHECK_INTERVAL_MS = 60 * 60 * 1000

export function startAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  // electron-updater needs the packaged app-update.yml (written by electron-builder
  // at build time from the `publish` config) — it has nothing to read in dev.
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (status: AppUpdateStatus): void => {
    getMainWindow()?.webContents.send(IPC.eventAppUpdateStatus, status)
    broadcastToRemote(IPC.eventAppUpdateStatus, status)
  }

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))

  autoUpdater.on('update-available', (info) => {
    send({ state: 'available', version: info.version })
    notify('Actualización disponible', `Descargando NyxLauncher ${info.version}...`)
  })

  autoUpdater.on('update-not-available', () => send({ state: 'not-available' }))

  autoUpdater.on('download-progress', (progress) => {
    send({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send({ state: 'downloaded', version: info.version })
    notify('Actualización lista', `NyxLauncher ${info.version} se instalará al reiniciar la app.`)
  })

  autoUpdater.on('error', (err) => {
    send({ state: 'error', message: err.message })
    console.error('Auto-update error:', err)
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => console.error('Auto-update check failed:', err))
  }

  check()
  setInterval(check, CHECK_INTERVAL_MS)
}

export function checkForUpdatesNow(): void {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdates().catch((err) => console.error('Auto-update check failed:', err))
}
