import { app, ipcMain, dialog, type BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import {
  DEFAULT_BACKUP_CONFIG,
  DEFAULT_CONFIG_FILE_PATH,
  DEFAULT_PLAYER_LIST_FILES,
  DEFAULT_UPDATE_CHECK_CONFIG,
  IPC
} from '../shared/types'
import type {
  AppSettings,
  CreateServerInput,
  ProxyBackendEntry,
  ServerFlavor,
  ServerStatus,
  UpdateServerInput
} from '../shared/types'
import { getServers, getSettings, saveServers, saveSettings } from './store'
import { serverManager } from './serverManager'
import * as fileManager from './fileManager'
import * as backupManager from './backupManager'
import { notify } from './notifications'
import { checkJavaVersion, detectServerJar } from './serverDetect'
import { listBuilds, listVersions, minecraftDownloadManager } from './minecraftDownloader'
import { readProxyConfig, writeProxyConfig } from './proxyConfig'
import { checkForUpdatesNow } from './autoUpdate'

function requireServer(id: string): ReturnType<typeof getServers>[number] {
  const server = getServers().find((s) => s.id === id)
  if (!server) throw new Error(`Server ${id} not found`)
  return server
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.serversList, () => getServers())

  ipcMain.handle(IPC.serversCreate, (_e, input: CreateServerInput) => {
    const now = new Date().toISOString()
    const servers = getServers()
    const created = {
      id: randomUUID(),
      ...input,
      configFilePath: input.configFilePath || DEFAULT_CONFIG_FILE_PATH,
      playerListFiles: input.playerListFiles ?? DEFAULT_PLAYER_LIST_FILES,
      backup: input.backup ?? DEFAULT_BACKUP_CONFIG,
      updateCheck: input.updateCheck ?? DEFAULT_UPDATE_CHECK_CONFIG,
      createdAt: now,
      updatedAt: now
    }
    saveServers([...servers, created])
    return created
  })

  ipcMain.handle(IPC.serversUpdate, (_e, input: UpdateServerInput) => {
    const servers = getServers()
    const idx = servers.findIndex((s) => s.id === input.id)
    if (idx === -1) throw new Error(`Server ${input.id} not found`)
    const updated = { ...servers[idx], ...input, updatedAt: new Date().toISOString() }
    const next = [...servers]
    next[idx] = updated
    saveServers(next)
    return updated
  })

  ipcMain.handle(IPC.serversDelete, async (_e, id: string) => {
    if (serverManager.isRunning(id)) serverManager.kill(id)
    saveServers(getServers().filter((s) => s.id !== id))
    await backupManager.deleteAllBackupsForServer(id)
  })

  ipcMain.handle(IPC.serverStart, (_e, id: string) => {
    serverManager.start(requireServer(id))
  })

  ipcMain.handle(IPC.serverStop, (_e, id: string) => {
    serverManager.stop(id)
  })

  ipcMain.handle(IPC.serverKill, (_e, id: string) => {
    serverManager.kill(id)
  })

  ipcMain.handle(IPC.serverRestart, (_e, id: string) => {
    serverManager.restart(requireServer(id))
  })

  ipcMain.handle(IPC.serverSendCommand, (_e, id: string, command: string) => {
    return serverManager.sendCommand(id, command)
  })

  ipcMain.handle(IPC.serverGetState, (_e, id: string) => serverManager.getState(id))

  ipcMain.handle(IPC.serverGetConsoleBuffer, (_e, id: string) => serverManager.getConsoleBuffer(id))

  ipcMain.handle(IPC.dialogPickDirectory, async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.dialogPickFile, async (_e, filters?: { name: string; extensions: string[] }[]) => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.filesList, (_e, serverId: string, relDir: string) =>
    fileManager.listDirectory(requireServer(serverId).workingDirectory, relDir)
  )

  ipcMain.handle(IPC.filesReadText, (_e, serverId: string, relPath: string) =>
    fileManager.readTextFile(requireServer(serverId).workingDirectory, relPath)
  )

  ipcMain.handle(IPC.filesWriteText, (_e, serverId: string, relPath: string, content: string) =>
    fileManager.writeTextFile(requireServer(serverId).workingDirectory, relPath, content)
  )

  ipcMain.handle(IPC.filesCreateFile, (_e, serverId: string, relPath: string) =>
    fileManager.createFile(requireServer(serverId).workingDirectory, relPath)
  )

  ipcMain.handle(IPC.filesCreateDirectory, (_e, serverId: string, relPath: string) =>
    fileManager.createDirectory(requireServer(serverId).workingDirectory, relPath)
  )

  ipcMain.handle(IPC.filesRename, (_e, serverId: string, fromRelPath: string, toRelPath: string) =>
    fileManager.renameEntry(requireServer(serverId).workingDirectory, fromRelPath, toRelPath)
  )

  ipcMain.handle(IPC.filesDelete, (_e, serverId: string, relPath: string) =>
    fileManager.deleteEntry(requireServer(serverId).workingDirectory, relPath)
  )

  ipcMain.handle(IPC.filesImport, (_e, serverId: string, destRelDir: string) =>
    fileManager.importPaths(getMainWindow(), requireServer(serverId).workingDirectory, destRelDir)
  )

  ipcMain.handle(IPC.filesExport, (_e, serverId: string, relPath: string) =>
    fileManager.exportPath(getMainWindow(), requireServer(serverId).workingDirectory, relPath)
  )

  ipcMain.handle(IPC.backupsList, (_e, serverId: string) => backupManager.listBackups(serverId))

  ipcMain.handle(IPC.backupsCreate, async (_e, serverId: string) => {
    const server = requireServer(serverId)
    if (serverManager.isRunning(serverId)) {
      serverManager.sendCommand(serverId, 'save-all')
      await new Promise((r) => setTimeout(r, 2000))
    }
    const entry = await backupManager.createBackup(server)
    notify('Backup completado', `Se creó una copia de seguridad de "${server.name}"`)
    return entry
  })

  ipcMain.handle(IPC.backupsRestore, (_e, serverId: string, backupId: string) => {
    if (serverManager.isRunning(serverId)) {
      throw new Error('Detén el servidor antes de restaurar una copia de seguridad')
    }
    return backupManager.restoreBackup(requireServer(serverId), backupId)
  })

  ipcMain.handle(IPC.backupsDelete, (_e, serverId: string, backupId: string) =>
    backupManager.deleteBackup(serverId, backupId)
  )

  ipcMain.handle(IPC.systemDetectServerJar, (_e, dirAbsPath: string) => detectServerJar(dirAbsPath))

  ipcMain.handle(IPC.systemCheckJavaVersion, (_e, javaPath: string) => checkJavaVersion(javaPath))

  ipcMain.handle(IPC.minecraftListVersions, (_e, flavor: ServerFlavor) => listVersions(flavor))

  ipcMain.handle(IPC.minecraftListBuilds, (_e, flavor: ServerFlavor, version: string) => listBuilds(flavor, version))

  ipcMain.handle(
    IPC.minecraftDownload,
    (_e, flavor: ServerFlavor, version: string, buildId: string, destDir: string) =>
      minecraftDownloadManager.start(flavor, version, buildId, destDir)
  )

  ipcMain.handle(IPC.minecraftCancelDownload, (_e, jobId: string) => minecraftDownloadManager.cancel(jobId))

  minecraftDownloadManager.on('progress', (progress) => {
    getMainWindow()?.webContents.send(IPC.eventDownloadProgress, progress)
  })
  minecraftDownloadManager.on('done', (result) => {
    getMainWindow()?.webContents.send(IPC.eventDownloadDone, result)
  })

  ipcMain.handle(IPC.proxyGetConfig, (_e, serverId: string) => readProxyConfig(requireServer(serverId).workingDirectory))

  ipcMain.handle(
    IPC.proxySaveConfig,
    (_e, serverId: string, servers: ProxyBackendEntry[], tryOrder: string[]) =>
      writeProxyConfig(requireServer(serverId).workingDirectory, servers, tryOrder)
  )

  ipcMain.handle(IPC.appGetVersion, () => app.getVersion())

  ipcMain.handle(IPC.appCheckForUpdates, () => checkForUpdatesNow())

  ipcMain.handle(IPC.settingsGet, () => getSettings())

  ipcMain.handle(IPC.settingsUpdate, (_e, settings: AppSettings) => {
    saveSettings(settings)
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: settings.launchOnStartup })
    }
    return settings
  })

  const lastNotifiedStatus = new Map<string, ServerStatus>()

  serverManager.on('consoleLine', (line) => {
    getMainWindow()?.webContents.send(IPC.eventConsoleLine, line)
  })
  serverManager.on('stateChanged', (state) => {
    getMainWindow()?.webContents.send(IPC.eventStateChanged, state)

    const previous = lastNotifiedStatus.get(state.id)
    lastNotifiedStatus.set(state.id, state.status)
    if (previous === state.status) return

    const server = getServers().find((s) => s.id === state.id)
    if (!server) return
    if (state.status === 'online' && previous === 'starting') {
      notify('Servidor iniciado', `"${server.name}" está en línea`)
    } else if (state.status === 'crashed') {
      notify('Servidor caído', `"${server.name}" se detuvo inesperadamente`)
    }
  })
}
