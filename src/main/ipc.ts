import type { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { platform } from './platform/platform'
import { registerHandler, broadcastToRemote } from './remoteBridge'
import * as authManager from './auth/authManager'
import * as sessionManager from './auth/sessionManager'
import { startRemoteServer, getRemoteServerStatus, validateRemoteAccessSettings } from './remoteServer'
import * as tailscaleManager from './remoteAccess/tailscaleManager'
import * as cloudflareManager from './remoteAccess/cloudflareManager'
import * as caddyManager from './remoteAccess/caddyManager'
import * as cloudflareApi from './remoteAccess/cloudflareApi'
import * as totpManager from './auth/totpManager'
import * as deviceManager from './auth/deviceManager'
import * as accessLog from './auth/accessLog'
import * as emailSender from './auth/emailSender'
import { readSecrets, writeSecrets } from './auth/secretsStore'
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
import { checkJavaVersion, detectServerJar, importServerZip } from './serverDetect'
import { listBuilds, listVersions, minecraftDownloadManager } from './minecraftDownloader'
import { readProxyConfig, writeProxyConfig } from './proxyConfig'
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

  registerHandler(IPC.serversNextAvailablePort, () => {
    const range = getSettings().dockerPortRange
    if (!range) return null
    const used = new Set(getServers().map((s) => s.port))
    for (let port = range.start; port <= range.end; port++) {
      if (!used.has(port)) return port
    }
    return null
  })

  registerHandler(IPC.configGetDefaults, () => ({
    serversRootHint: process.env.NYXLAUNCHER_SERVERS_ROOT ?? null
  }))

  registerHandler(IPC.dialogPickDirectory, () => platform.pickDirectory(getMainWindow()))

  registerHandler(IPC.dialogPickFile, (_e, filters?: { name: string; extensions: string[] }[]) =>
    platform.pickFile(getMainWindow(), filters)
  )

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
    platform.notify('Backup completado', `Se creó una copia de seguridad de "${server.name}"`)
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
    if (success) platform.notify('Mapa renderizado', `El mapa de "${server.name}" se ha actualizado`)
    else platform.notify('Error al renderizar el mapa', `No se pudo renderizar el mapa de "${server.name}"`)
  })

  registerHandler(IPC.appGetVersion, () => platform.getAppVersion())

  registerHandler(IPC.appCheckForUpdates, () => platform.checkForUpdates())

  registerHandler(IPC.settingsGet, () => getSettings())

  registerHandler(IPC.settingsUpdate, async (_e, settings: AppSettings) => {
    validateRemoteAccessSettings(settings.remoteAccess)
    saveSettings(settings)
    platform.setLaunchOnStartup(settings.launchOnStartup)
    await startRemoteServer()
    return settings
  })

  registerHandler(IPC.remoteServerGetStatus, () => getRemoteServerStatus())

  registerHandler(IPC.remoteAuthGetStatus, () => ({
    accountConfigured: authManager.isAccountConfigured(),
    username: authManager.getUsername()
  }))

  registerHandler(IPC.remoteAuthSetPassword, (_e, username: string, password: string) => {
    authManager.setCredentials(username, password)
  })

  registerHandler(IPC.remoteAuthChangePassword, (_e, currentPassword: string, newPassword: string) => {
    authManager.changePassword(currentPassword, newPassword)
    sessionManager.revokeAllSessions()
  })

  registerHandler(IPC.remoteAuthChangeUsername, (_e, currentPassword: string, newUsername: string) => {
    authManager.changeUsername(currentPassword, newUsername)
    sessionManager.revokeAllSessions()
  })

  registerHandler(IPC.remoteSessionsList, () => sessionManager.listSessions(null))

  registerHandler(IPC.remoteSessionsRevoke, (_e, id: string) => {
    sessionManager.revokeSession(id)
  })

  registerHandler(IPC.remoteSessionsRevokeAll, () => {
    sessionManager.revokeAllSessions()
  })

  registerHandler(IPC.tailscaleGetStatus, () => tailscaleManager.getStatus())

  registerHandler(IPC.tailscaleInstall, async () => {
    await tailscaleManager.install((downloadedBytes, totalBytes) => {
      const progress = { downloadedBytes, totalBytes }
      getMainWindow()?.webContents.send(IPC.eventTailscaleInstallProgress, progress)
      broadcastToRemote(IPC.eventTailscaleInstallProgress, progress)
    })
  })

  registerHandler(IPC.tailscaleConnect, async () => {
    await tailscaleManager.connect((url) => {
      getMainWindow()?.webContents.send(IPC.eventTailscaleAuthUrl, url)
      broadcastToRemote(IPC.eventTailscaleAuthUrl, url)
    })
    await startRemoteServer()
  })

  registerHandler(IPC.tailscaleDisconnect, async () => {
    await tailscaleManager.disconnect()
    await startRemoteServer()
  })

  registerHandler(IPC.totpBegin, () => totpManager.begin())
  registerHandler(IPC.totpVerify, (_e, code: string) => totpManager.verify(code))
  registerHandler(IPC.totpDisable, (_e, password: string) => totpManager.disable(password))

  registerHandler(IPC.devicesList, () => deviceManager.listDevices())
  registerHandler(IPC.devicesRevoke, (_e, id: string) => deviceManager.revokeDevice(id))

  registerHandler(IPC.accessLogList, () => accessLog.list())

  registerHandler(IPC.emailGetStatus, () => emailSender.getStatus())
  registerHandler(IPC.emailSetApiKey, (_e, apiKey: string) => emailSender.setApiKey(apiKey))

  registerHandler(IPC.cloudflareGetStatus, () => cloudflareManager.getStatus())

  registerHandler(IPC.cloudflareInstall, async () => {
    await cloudflareManager.install((downloadedBytes, totalBytes) => {
      const progress = { downloadedBytes, totalBytes }
      getMainWindow()?.webContents.send(IPC.eventCloudflareInstallProgress, progress)
      broadcastToRemote(IPC.eventCloudflareInstallProgress, progress)
    })
  })

  registerHandler(IPC.cloudflareConnectQuick, async () => {
    const settings = getSettings()
    await cloudflareManager.connectQuick(settings.remoteAccess.lanPort, (url) => {
      getMainWindow()?.webContents.send(IPC.eventCloudflareUrl, url)
      broadcastToRemote(IPC.eventCloudflareUrl, url)
    })
    await startRemoteServer()
  })

  registerHandler(IPC.cloudflareConnectDomain, async (_e, domain: string, apiToken: string) => {
    writeSecrets({ ...readSecrets(), cloudflareApiToken: apiToken })
    const accountId = await cloudflareApi.discoverAccountId(apiToken)
    const zoneId = await cloudflareApi.resolveZoneId(apiToken, domain)
    const tunnelName = `nyxlauncher-${randomUUID().slice(0, 8)}`
    const { id: tunnelId, runToken } = await cloudflareApi.createTunnel(apiToken, accountId, tunnelName)
    const settings = getSettings()
    await cloudflareApi.configureIngress(apiToken, accountId, tunnelId, domain, settings.remoteAccess.lanPort)
    await cloudflareApi.createOrUpdateDnsRecord(apiToken, zoneId, domain, tunnelId)
    writeSecrets({ ...readSecrets(), cloudflareTunnelId: tunnelId, cloudflareTunnelToken: runToken })
    cloudflareManager.setDomainUrl(`https://${domain}`)
    await cloudflareManager.connectWithToken(runToken)
    saveSettings({ ...settings, remoteAccess: { ...settings.remoteAccess, customDomain: domain } })
    await startRemoteServer()
  })

  registerHandler(IPC.cloudflareDisconnect, async () => {
    await cloudflareManager.disconnect()
    await caddyManager.stop()
    cloudflareManager.setDomainUrl(null)
    await startRemoteServer()
  })

  registerHandler(IPC.caddyCheckDns, (_e, domain: string) => caddyManager.checkDns(domain))

  registerHandler(IPC.caddyInstall, async () => {
    await caddyManager.install((downloadedBytes, totalBytes) => {
      const progress = { downloadedBytes, totalBytes }
      getMainWindow()?.webContents.send(IPC.eventCloudflareInstallProgress, progress)
      broadcastToRemote(IPC.eventCloudflareInstallProgress, progress)
    })
  })

  registerHandler(IPC.caddyStart, async (_e, domain: string) => {
    const settings = getSettings()
    await caddyManager.start(domain, settings.remoteAccess.lanPort)
    cloudflareManager.setDomainUrl(`https://${domain}`)
    saveSettings({ ...settings, remoteAccess: { ...settings.remoteAccess, customDomain: domain } })
    await startRemoteServer()
  })

  registerHandler(IPC.caddyStop, async () => {
    await caddyManager.stop()
    cloudflareManager.setDomainUrl(null)
    await startRemoteServer()
  })

  registerHandler(IPC.caddyGetStatus, () => ({ installed: caddyManager.isInstalled(), running: caddyManager.isRunning() }))

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
      platform.notify('Servidor iniciado', `"${server.name}" está en línea`)
    } else if (state.status === 'crashed') {
      platform.notify('Servidor caído', `"${server.name}" se detuvo inesperadamente`)
    }
  })
}
