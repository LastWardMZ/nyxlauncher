import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { serverManager } from './serverManager'
import { getServers } from './store'
import { startMetricsLoop } from './metrics'
import { startMapHttpServer } from './mapHttpServer'
import { startBackupScheduler } from './backupScheduler'
import { startBuildUpdateChecker } from './buildUpdateChecker'
import { startAutoUpdater } from './autoUpdate'
import { notify } from './notifications'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d12',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // In packaged builds the OS reads the icon embedded by electron-builder;
    // this only matters for `npm run dev`/unpacked runs (mainly Linux taskbars).
    ...(is.dev ? { icon: join(__dirname, '../../resources/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.nyxevo.nyxlauncher')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await startMapHttpServer(getServers)
  registerIpcHandlers(() => mainWindow)
  startMetricsLoop(serverManager, () =>
    getServers()
      .map((s) => s.id)
      .filter((id) => serverManager.isRunning(id))
  )
  startBackupScheduler(getServers, (server) => {
    notify('Backup completado', `Copia de seguridad programada creada para "${server.name}"`)
  })
  startBuildUpdateChecker(getServers, (server, latestBuild) => {
    notify('Actualización disponible', `Build ${latestBuild} disponible para "${server.name}"`)
  })

  createWindow()
  startAutoUpdater(() => mainWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Best-effort: ask every still-running server to stop so we don't leave
  // orphaned java/server processes behind when the launcher exits.
  for (const s of getServers()) {
    if (serverManager.isRunning(s.id)) serverManager.kill(s.id)
  }
})
