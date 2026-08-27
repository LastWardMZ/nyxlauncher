import { app, dialog, type BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { registerHandler, broadcastToRemote } from './remoteBridge'
import * as authManager from './auth/authManager'
import * as sessionManager from './auth/sessionManager'
import { startRemoteServer, getRemoteServerStatus, validateRemoteAccessSettings } from './remoteServer'
import {
  DEFAULT_BACKUP_CONFIG,
  DEFAULT_CONFIG_FILE_PATH,
  DEFAULT_MAP_RENDER_CONFIG,
  DEFAULT_PLAYER_LIST_FILES,
  DEFAULT_UPDATE_CHECK_CONFIG,
  IPC
} from '../shared/types'
import type {
  AppSettings,
  ContentProvider,
  ContentSearchParams,
  CreateServerInput,
  ProxyBackendEntry,
  ServerFlavor,
  ServerStatus,
  UpdateServerInput
} from '../shared/types'
import { getServers, getSettings, saveServers, saveSettings } from './store'
import { serverManager } from './serverManager'
import { getDiskUsage } from './diskUsage'
import * as mapManager from './mapManager'
import * as mapCliManager from './mapCliManager'
import { getMapServerPort } from './mapHttpServer'
import * as fileManager from './fileManager'
import * as backupManager from './backupManager'
import { notify } from './notifications'
import { checkJavaVersion, detectServerJar, importServerZip } from './serverDetect'
import { listBuilds, listVersions, minecraftDownloadManager } from './minecraftDownloader'
import { readProxyConfig, writeProxyConfig } from './proxyConfig'
import { checkForUpdatesNow } from './autoUpdate'
import { contentManager } from './content/contentManager'
import { getProvider } from './content/providers'

function requireServer(id: string): ReturnType<typeof getServers>[number] {
  const server = getServers().find((s) => s.id === id)
  if (!server) throw new Error(`Server ${id} not found`)
  return server
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  registerHandler(IPC.serversList, () => getServers())

  registerHandler(IPC.serversCreate, (_e, input: CreateServerInput) => {
    const now = new Date().toISOString()
    const servers = getServers()
    const created = {
      id: randomUUID(),
      ...input,
      configFilePath: input.configFilePath || DEFAULT_CONFIG_FILE_PATH,
      playerListFiles: input.playerListFiles ?? DEFAULT_PLAYER_LIST_FILES,
      backup: input.backup ?? DEFAULT_BACKUP_CONFIG,
      updateCheck: input.updateCheck ?? DEFAULT_UPDATE_CHECK_CONFIG,
      mapRender: input.mapRender ?? DEFAULT_MAP_RENDER_CONFIG,
      createdAt: now,
      updatedAt: now
    }
    saveServers([...servers, created])
    return created
  })

  registerHandler(IPC.serversUpdate, (_e, input: UpdateServerInput) => {
    const servers = getServers()
    const idx = servers.findIndex((s) => s.id === input.id)
    if (idx === -1) throw new Error(`Server ${input.id} not found`)
    const updated = { ...servers[idx], ...input, updatedAt: new Date().toISOString() }
    const next = [...servers]
    next[idx] = updated
    saveServers(next)
    return updated
  })

  registerHandler(IPC.serversDelete, async (_e, id: string) => {
    if (serverManager.isRunning(id)) serverManager.kill(id)
    saveServers(getServers().filter((s) => s.id !== id))
    await backupManager.deleteAllBackupsForServer(id)
  })

  registerHandler(IPC.serverStart, (_e, id: string) => {
    serverManager.start(requireServer(id))
  })

  registerHandler(IPC.serverStop, (_e, id: string) => {
    serverManager.stop(id)
  })

  registerHandler(IPC.serverKill, (_e, id: string) => {
    serverManager.kill(id)
  })

  registerHandler(IPC.serverRestart, (_e, id: string) => {
    serverManager.restart(requireServer(id))
  })

  registerHandler(IPC.serverSendCommand, (_e, id: string, command: string) => {
    return serverManager.sendCommand(id, command)
  })

  registerHandler(IPC.serverGetState, (_e, id: string) => serverManager.getState(id))

  registerHandler(IPC.serverGetConsoleBuffer, (_e, id: string) => serverManager.getConsoleBuffer(id))

  registerHandler(IPC.serverGetDiskUsage, (_e, id: string) => getDiskUsage(requireServer(id).workingDirectory))

  registerHandler(IPC.dialogPickDirectory, async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  registerHandler(IPC.dialogPickFile, async (_e, filters?: { name: string; extensions: string[] }[]) => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  registerHandler(IPC.filesList, (_e, serverId: string, relDir: string) =>
    fileManager.listDirectory(requireServer(serverId).workingDirectory, relDir)
  )

  registerHandler(IPC.filesReadText, (_e, serverId: string, relPath: string) =>
    fileManager.readTextFile(requireServer(serverId).workingDirectory, relPath)
  )

  registerHandler(IPC.filesWriteText, (_e, serverId: string, relPath: string, content: string) =>
    fileManager.writeTextFile(requireServer(serverId).workingDirectory, relPath, content)
  )

  registerHandler(IPC.filesCreateFile, (_e, serverId: string, relPath: string) =>
    fileManager.createFile(requireServer(serverId).workingDirectory, relPath)
  )

  registerHandler(IPC.filesCreateDirectory, (_e, serverId: string, relPath: string) =>
    fileManager.createDirectory(requireServer(serverId).workingDirectory, relPath)
  )

  registerHandler(IPC.filesRename, (_e, serverId: string, fromRelPath: string, toRelPath: string) =>
    fileManager.renameEntry(requireServer(serverId).workingDirectory, fromRelPath, toRelPath)
  )

  registerHandler(IPC.filesDelete, (_e, serverId: string, relPath: string) =>
    fileManager.deleteEntry(requireServer(serverId).workingDirectory, relPath)
  )

  registerHandler(IPC.filesImport, (_e, serverId: string, destRelDir: string) =>
    fileManager.importPaths(getMainWindow(), requireServer(serverId).workingDirectory, destRelDir)
  )

  registerHandler(IPC.filesExport, (_e, serverId: string, relPath: string) =>
    fileManager.exportPath(getMainWindow(), requireServer(serverId).workingDirectory, relPath)
  )

  registerHandler(IPC.backupsList, (_e, serverId: string) => backupManager.listBackups(serverId))

  registerHandler(IPC.backupsCreate, async (_e, serverId: string) => {
    const server = requireServer(serverId)
    if (serverManager.isRunning(serverId)) {
      serverManager.sendCommand(serverId, 'save-all')
      await new Promise((r) => setTimeout(r, 2000))
    }
    const entry = await backupManager.createBackup(server)
    notify('Backup completado', `Se creó una copia de seguridad de "${server.name}"`)
    return entry
  })

  registerHandler(IPC.backupsRestore, (_e, serverId: string, backupId: string) => {
    if (serverManager.isRunning(serverId)) {
      throw new Error('Detén el servidor antes de restaurar una copia de seguridad')
    }
    return backupManager.restoreBackup(requireServer(serverId), backupId)
  })

  registerHandler(IPC.backupsDelete, (_e, serverId: string, backupId: string) =>
    backupManager.deleteBackup(serverId, backupId)
  )

  registerHandler(IPC.systemDetectServerJar, (_e, dirAbsPath: string) => detectServerJar(dirAbsPath))

  registerHandler(IPC.systemCheckJavaVersion, (_e, javaPath: string) => checkJavaVersion(javaPath))

  registerHandler(IPC.systemImportServerZip, async (_e, zipPath: string, destDir: string) => ({
    destDir,
    executable: await importServerZip(zipPath, destDir)
  }))

  registerHandler(IPC.minecraftListVersions, (_e, flavor: ServerFlavor) => listVersions(flavor))

  registerHandler(IPC.minecraftListBuilds, (_e, flavor: ServerFlavor, version: string) => listBuilds(flavor, version))

  registerHandler(
    IPC.minecraftDownload,
    (_e, flavor: ServerFlavor, version: string, buildId: string, destDir: string) =>
      minecraftDownloadManager.start(flavor, version, buildId, destDir)
  )

  registerHandler(IPC.minecraftCancelDownload, (_e, jobId: string) => minecraftDownloadManager.cancel(jobId))

  minecraftDownloadManager.on('progress', (progress) => {
    getMainWindow()?.webContents.send(IPC.eventDownloadProgress, progress)
    broadcastToRemote(IPC.eventDownloadProgress, progress)
  })
  minecraftDownloadManager.on('done', (result) => {
    getMainWindow()?.webContents.send(IPC.eventDownloadDone, result)
    broadcastToRemote(IPC.eventDownloadDone, result)
  })

  registerHandler(IPC.contentSearch, (_e, providerId: ContentProvider, params: ContentSearchParams) =>
    getProvider(providerId).search(params)
  )

  registerHandler(IPC.contentGetProject, (_e, providerId: ContentProvider, projectId: string) =>
    getProvider(providerId).getProject(projectId)
  )

  registerHandler(
    IPC.contentListVersions,
    (_e, providerId: ContentProvider, projectId: string, loader: string, mcVersion: string, ignoreCompatibility?: boolean) =>
      getProvider(providerId).getVersions(projectId, loader, mcVersion, ignoreCompatibility)
  )

  registerHandler(
    IPC.contentInstall,
    (
      _e,
      serverId: string,
      providerId: ContentProvider,
      projectId: string,
      title: string,
      versionId: string,
      ignoreCompatibility?: boolean
    ) => contentManager.start(requireServer(serverId), providerId, projectId, title, versionId, ignoreCompatibility)
  )

  registerHandler(IPC.contentInstallModpack, (_e, serverId: string, mrpackPath: string) =>
    contentManager.installModpack(requireServer(serverId), mrpackPath)
  )

  registerHandler(IPC.contentUpdate, (_e, serverId: string, providerId: ContentProvider, projectId: string) =>
    contentManager.update(requireServer(serverId), providerId, projectId)
  )

  registerHandler(IPC.contentUninstall, (_e, serverId: string, projectId: string) =>
    contentManager.uninstall(requireServer(serverId), projectId)
  )

  registerHandler(IPC.contentListInstalled, (_e, serverId: string) => contentManager.listInstalled(requireServer(serverId)))

  contentManager.on('progress', (progress) => {
    getMainWindow()?.webContents.send(IPC.eventContentProgress, progress)
    broadcastToRemote(IPC.eventContentProgress, progress)
  })
  contentManager.on('done', (result) => {
    getMainWindow()?.webContents.send(IPC.eventContentDone, result)
    broadcastToRemote(IPC.eventContentDone, result)
  })

  registerHandler(IPC.proxyGetConfig, (_e, serverId: string) => readProxyConfig(requireServer(serverId).workingDirectory))

  registerHandler(
    IPC.proxySaveConfig,
    (_e, serverId: string, servers: ProxyBackendEntry[], tryOrder: string[]) =>
      writeProxyConfig(requireServer(serverId).workingDirectory, servers, tryOrder)
  )

  registerHandler(IPC.mapGetStatus, (_e, serverId: string) => mapManager.getMapStatus(requireServer(serverId)))

  registerHandler(IPC.mapInstall, (_e, serverId: string) => mapManager.installBlueMap(requireServer(serverId)))

  registerHandler(IPC.mapActivate, (_e, serverId: string) => mapManager.activateMap(requireServer(serverId)))

  registerHandler(IPC.mapPurge, (_e, serverId: string) => mapManager.purgeMapData(requireServer(serverId)))

  registerHandler(IPC.mapGetUrl, (_e, serverId: string) => {
    requireServer(serverId)
    const port = getMapServerPort()
    if (!port) throw new Error('El servidor de mapas no está disponible')
    return `http://127.0.0.1:${port}/map/${serverId}/`
  })

  registerHandler(IPC.mapGetDiskUsage, (_e, serverId: string) => mapManager.getMapDiskUsageBytes(requireServer(serverId)))

  registerHandler(IPC.mapCliInstall, (_e, serverId: string) => mapCliManager.mapCliInstaller.install(requireServer(serverId)))

  registerHandler(IPC.mapCliPrepareConfig, (_e, serverId: string) => mapCliManager.prepareConfig(requireServer(serverId)))

  registerHandler(IPC.mapCliRenderNow, (_e, serverId: string) => {
    const server = requireServer(serverId)
    if (mapCliManager.isRendering(serverId)) throw new Error('Ya hay un render en curso')
    return mapCliManager.startRender(server)
  })

  registerHandler(IPC.mapCliCancelRender, (_e, serverId: string) => mapCliManager.cancelRender(serverId))

  registerHandler(IPC.mapCliResolveWorldPath, (_e, serverId: string) => mapCliManager.resolveWorldPath(requireServer(serverId)))

  mapCliManager.mapCliInstaller.on('progress', (progress) => {
    getMainWindow()?.webContents.send(IPC.eventMapCliProgress, progress)
    broadcastToRemote(IPC.eventMapCliProgress, progress)
  })
  mapCliManager.mapCliInstaller.on('done', (result) => {
    getMainWindow()?.webContents.send(IPC.eventMapCliDone, result)
    broadcastToRemote(IPC.eventMapCliDone, result)
  })
  mapCliManager.mapCliRenderEvents.on('done', ({ server, success }: { server: ReturnType<typeof getServers>[number]; success: boolean }) => {
    if (success) notify('Mapa renderizado', `El mapa de "${server.name}" se ha actualizado`)
    else notify('Error al renderizar el mapa', `No se pudo renderizar el mapa de "${server.name}"`)
  })

  registerHandler(IPC.appGetVersion, () => app.getVersion())

  registerHandler(IPC.appCheckForUpdates, () => checkForUpdatesNow())

  registerHandler(IPC.settingsGet, () => getSettings())

  registerHandler(IPC.settingsUpdate, async (_e, settings: AppSettings) => {
    validateRemoteAccessSettings(settings.remoteAccess)
    saveSettings(settings)
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: settings.launchOnStartup })
    }
    await startRemoteServer()
    return settings
  })

  registerHandler(IPC.remoteServerGetStatus, () => getRemoteServerStatus())

  registerHandler(IPC.remoteAuthGetStatus, () => ({ accountConfigured: authManager.isAccountConfigured() }))

  registerHandler(IPC.remoteAuthSetPassword, (_e, password: string) => {
    authManager.setPassword(password)
  })

  registerHandler(IPC.remoteAuthChangePassword, (_e, currentPassword: string, newPassword: string) => {
    authManager.changePassword(currentPassword, newPassword)
    sessionManager.revokeAllSessions()
  })

  registerHandler(IPC.remoteSessionsList, () => sessionManager.listSessions(null))

  registerHandler(IPC.remoteSessionsRevoke, (_e, id: string) => {
    sessionManager.revokeSession(id)
  })

  registerHandler(IPC.remoteSessionsRevokeAll, () => {
    sessionManager.revokeAllSessions()
  })

  const lastNotifiedStatus = new Map<string, ServerStatus>()

  serverManager.on('consoleLine', (line) => {
    getMainWindow()?.webContents.send(IPC.eventConsoleLine, line)
    broadcastToRemote(IPC.eventConsoleLine, line)
  })
  serverManager.on('stateChanged', (state) => {
    getMainWindow()?.webContents.send(IPC.eventStateChanged, state)
    broadcastToRemote(IPC.eventStateChanged, state)

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
