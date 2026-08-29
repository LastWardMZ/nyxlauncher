import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  AppSettings,
  AppUpdateStatus,
  BackupEntry,
  ConsoleLine,
  ContentInstallResult,
  ContentProjectDetail,
  ContentProvider,
  ContentSearchPage,
  ContentSearchParams,
  ContentVersion,
  CreateServerInput,
  DiskUsageInfo,
  DownloadProgress,
  DownloadResult,
  FileEntry,
  ImportServerZipResult,
  InstalledContentEntry,
  JavaVersionCheck,
  MapCliInstallResult,
  MapStatus,
  MinecraftBuildOption,
  MinecraftVersionOption,
  ContentInstallProgress,
  ConfigDefaults,
  ProxyBackendEntry,
  ProxyConfigResult,
  ReadTextFileResult,
  RemoteAuthStatus,
  RemoteServerStatus,
  RemoteSessionInfo,
  ServerConfig,
  ServerFlavor,
  ServerRuntimeState,
  TailscaleStatus,
  CloudflareStatus,
  TotpSetupInfo,
  TrustedDeviceInfo,
  AccessLogEntry,
  EmailConfigStatus,
  UpdateServerInput
} from '../shared/types'

const api = {
  servers: {
    list: (): Promise<ServerConfig[]> => ipcRenderer.invoke(IPC.serversList),
    create: (input: CreateServerInput): Promise<ServerConfig> =>
      ipcRenderer.invoke(IPC.serversCreate, input),
    update: (input: UpdateServerInput): Promise<ServerConfig> =>
      ipcRenderer.invoke(IPC.serversUpdate, input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serversDelete, id),
    nextAvailablePort: (): Promise<number | null> => ipcRenderer.invoke(IPC.serversNextAvailablePort)
  },
  config: {
    getDefaults: (): Promise<ConfigDefaults> => ipcRenderer.invoke(IPC.configGetDefaults)
  },
  server: {
    start: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serverStart, id),
    stop: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serverStop, id),
    kill: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serverKill, id),
    restart: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serverRestart, id),
    sendCommand: (id: string, command: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.serverSendCommand, id, command),
    getState: (id: string): Promise<ServerRuntimeState> => ipcRenderer.invoke(IPC.serverGetState, id),
    getConsoleBuffer: (id: string): Promise<ConsoleLine[]> =>
      ipcRenderer.invoke(IPC.serverGetConsoleBuffer, id),
    getDiskUsage: (id: string): Promise<DiskUsageInfo> => ipcRenderer.invoke(IPC.serverGetDiskUsage, id)
  },
  dialogs: {
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogPickDirectory),
    pickFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialogPickFile, filters)
  },
  files: {
    list: (serverId: string, relDir: string): Promise<FileEntry[]> =>
      ipcRenderer.invoke(IPC.filesList, serverId, relDir),
    readText: (serverId: string, relPath: string): Promise<ReadTextFileResult | null> =>
      ipcRenderer.invoke(IPC.filesReadText, serverId, relPath),
    writeText: (serverId: string, relPath: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC.filesWriteText, serverId, relPath, content),
    createFile: (serverId: string, relPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.filesCreateFile, serverId, relPath),
    createDirectory: (serverId: string, relPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.filesCreateDirectory, serverId, relPath),
    rename: (serverId: string, fromRelPath: string, toRelPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.filesRename, serverId, fromRelPath, toRelPath),
    remove: (serverId: string, relPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.filesDelete, serverId, relPath),
    import: (serverId: string, destRelDir: string): Promise<number> =>
      ipcRenderer.invoke(IPC.filesImport, serverId, destRelDir),
    export: (serverId: string, relPath: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.filesExport, serverId, relPath)
  },
  backups: {
    list: (serverId: string): Promise<BackupEntry[]> => ipcRenderer.invoke(IPC.backupsList, serverId),
    create: (serverId: string): Promise<BackupEntry> => ipcRenderer.invoke(IPC.backupsCreate, serverId),
    restore: (serverId: string, backupId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.backupsRestore, serverId, backupId),
    remove: (serverId: string, backupId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.backupsDelete, serverId, backupId)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    update: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsUpdate, settings)
  },
  system: {
    detectServerJar: (dirAbsPath: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.systemDetectServerJar, dirAbsPath),
    checkJavaVersion: (javaPath: string): Promise<JavaVersionCheck> =>
      ipcRenderer.invoke(IPC.systemCheckJavaVersion, javaPath),
    importServerZip: (zipPath: string, destDir: string): Promise<ImportServerZipResult> =>
      ipcRenderer.invoke(IPC.systemImportServerZip, zipPath, destDir)
  },
  minecraft: {
    listVersions: (flavor: ServerFlavor): Promise<MinecraftVersionOption[]> =>
      ipcRenderer.invoke(IPC.minecraftListVersions, flavor),
    listBuilds: (flavor: ServerFlavor, version: string): Promise<MinecraftBuildOption[]> =>
      ipcRenderer.invoke(IPC.minecraftListBuilds, flavor, version),
    download: (flavor: ServerFlavor, version: string, buildId: string, destDir: string): Promise<string> =>
      ipcRenderer.invoke(IPC.minecraftDownload, flavor, version, buildId, destDir),
    cancelDownload: (jobId: string): Promise<void> => ipcRenderer.invoke(IPC.minecraftCancelDownload, jobId)
  },
  proxy: {
    getConfig: (serverId: string): Promise<ProxyConfigResult> => ipcRenderer.invoke(IPC.proxyGetConfig, serverId),
    saveConfig: (serverId: string, servers: ProxyBackendEntry[], tryOrder: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.proxySaveConfig, serverId, servers, tryOrder)
  },
  content: {
    search: (providerId: ContentProvider, params: ContentSearchParams): Promise<ContentSearchPage> =>
      ipcRenderer.invoke(IPC.contentSearch, providerId, params),
    getProject: (providerId: ContentProvider, projectId: string): Promise<ContentProjectDetail> =>
      ipcRenderer.invoke(IPC.contentGetProject, providerId, projectId),
    listVersions: (
      providerId: ContentProvider,
      projectId: string,
      loader: string,
      mcVersion: string,
      ignoreCompatibility?: boolean
    ): Promise<ContentVersion[]> =>
      ipcRenderer.invoke(IPC.contentListVersions, providerId, projectId, loader, mcVersion, ignoreCompatibility),
    install: (
      serverId: string,
      providerId: ContentProvider,
      projectId: string,
      title: string,
      versionId: string,
      ignoreCompatibility?: boolean
    ): Promise<string> =>
      ipcRenderer.invoke(IPC.contentInstall, serverId, providerId, projectId, title, versionId, ignoreCompatibility),
    installModpack: (serverId: string, mrpackPath: string): Promise<ContentInstallResult> =>
      ipcRenderer.invoke(IPC.contentInstallModpack, serverId, mrpackPath),
    update: (serverId: string, providerId: ContentProvider, projectId: string): Promise<InstalledContentEntry | null> =>
      ipcRenderer.invoke(IPC.contentUpdate, serverId, providerId, projectId),
    uninstall: (serverId: string, projectId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.contentUninstall, serverId, projectId),
    listInstalled: (serverId: string): Promise<InstalledContentEntry[]> =>
      ipcRenderer.invoke(IPC.contentListInstalled, serverId)
  },
  map: {
    getStatus: (serverId: string): Promise<MapStatus> => ipcRenderer.invoke(IPC.mapGetStatus, serverId),
    install: (serverId: string): Promise<string> => ipcRenderer.invoke(IPC.mapInstall, serverId),
    activate: (serverId: string): Promise<void> => ipcRenderer.invoke(IPC.mapActivate, serverId),
    purge: (serverId: string): Promise<void> => ipcRenderer.invoke(IPC.mapPurge, serverId),
    getUrl: (serverId: string): Promise<string> => ipcRenderer.invoke(IPC.mapGetUrl, serverId),
    getDiskUsage: (serverId: string): Promise<number> => ipcRenderer.invoke(IPC.mapGetDiskUsage, serverId),
    cliInstall: (serverId: string): Promise<string> => ipcRenderer.invoke(IPC.mapCliInstall, serverId),
    cliPrepareConfig: (serverId: string): Promise<void> => ipcRenderer.invoke(IPC.mapCliPrepareConfig, serverId),
    cliRenderNow: (serverId: string): Promise<void> => ipcRenderer.invoke(IPC.mapCliRenderNow, serverId),
    cliCancelRender: (serverId: string): Promise<void> => ipcRenderer.invoke(IPC.mapCliCancelRender, serverId),
    cliResolveWorldPath: (serverId: string): Promise<string> => ipcRenderer.invoke(IPC.mapCliResolveWorldPath, serverId)
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appGetVersion),
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC.appCheckForUpdates)
  },
  remoteAccess: {
    getServerStatus: (): Promise<RemoteServerStatus> => ipcRenderer.invoke(IPC.remoteServerGetStatus),
    getAuthStatus: (): Promise<RemoteAuthStatus> => ipcRenderer.invoke(IPC.remoteAuthGetStatus),
    setPassword: (username: string, password: string): Promise<void> =>
      ipcRenderer.invoke(IPC.remoteAuthSetPassword, username, password),
    changePassword: (currentPassword: string, newPassword: string): Promise<void> =>
      ipcRenderer.invoke(IPC.remoteAuthChangePassword, currentPassword, newPassword),
    changeUsername: (currentPassword: string, newUsername: string): Promise<void> =>
      ipcRenderer.invoke(IPC.remoteAuthChangeUsername, currentPassword, newUsername),
    listSessions: (): Promise<RemoteSessionInfo[]> => ipcRenderer.invoke(IPC.remoteSessionsList),
    revokeSession: (id: string): Promise<void> => ipcRenderer.invoke(IPC.remoteSessionsRevoke, id),
    revokeAllSessions: (): Promise<void> => ipcRenderer.invoke(IPC.remoteSessionsRevokeAll)
  },
  tailscale: {
    getStatus: (): Promise<TailscaleStatus> => ipcRenderer.invoke(IPC.tailscaleGetStatus),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.tailscaleInstall),
    connect: (): Promise<void> => ipcRenderer.invoke(IPC.tailscaleConnect),
    disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.tailscaleDisconnect)
  },
  totp: {
    begin: (): Promise<TotpSetupInfo> => ipcRenderer.invoke(IPC.totpBegin),
    verify: (code: string): Promise<boolean> => ipcRenderer.invoke(IPC.totpVerify, code),
    disable: (password: string): Promise<void> => ipcRenderer.invoke(IPC.totpDisable, password)
  },
  devices: {
    list: (): Promise<TrustedDeviceInfo[]> => ipcRenderer.invoke(IPC.devicesList),
    revoke: (id: string): Promise<void> => ipcRenderer.invoke(IPC.devicesRevoke, id)
  },
  accessLog: {
    list: (): Promise<AccessLogEntry[]> => ipcRenderer.invoke(IPC.accessLogList)
  },
  email: {
    getStatus: (): Promise<EmailConfigStatus> => ipcRenderer.invoke(IPC.emailGetStatus),
    setApiKey: (apiKey: string): Promise<void> => ipcRenderer.invoke(IPC.emailSetApiKey, apiKey)
  },
  cloudflare: {
    getStatus: (): Promise<CloudflareStatus> => ipcRenderer.invoke(IPC.cloudflareGetStatus),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.cloudflareInstall),
    connectQuick: (): Promise<void> => ipcRenderer.invoke(IPC.cloudflareConnectQuick),
    connectDomain: (domain: string, apiToken: string): Promise<void> =>
      ipcRenderer.invoke(IPC.cloudflareConnectDomain, domain, apiToken),
    disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.cloudflareDisconnect)
  },
  caddy: {
    checkDns: (domain: string): Promise<{ resolves: boolean; addresses: string[] }> =>
      ipcRenderer.invoke(IPC.caddyCheckDns, domain),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.caddyInstall),
    start: (domain: string): Promise<void> => ipcRenderer.invoke(IPC.caddyStart, domain),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.caddyStop),
    getStatus: (): Promise<{ installed: boolean; running: boolean }> => ipcRenderer.invoke(IPC.caddyGetStatus)
  },
  events: {
    onConsoleLine: (cb: (line: ConsoleLine) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, line: ConsoleLine): void => cb(line)
      ipcRenderer.on(IPC.eventConsoleLine, listener)
      return () => ipcRenderer.removeListener(IPC.eventConsoleLine, listener)
    },
    onStateChanged: (cb: (state: ServerRuntimeState) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, state: ServerRuntimeState): void => cb(state)
      ipcRenderer.on(IPC.eventStateChanged, listener)
      return () => ipcRenderer.removeListener(IPC.eventStateChanged, listener)
    },
    onDownloadProgress: (cb: (progress: DownloadProgress) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, progress: DownloadProgress): void => cb(progress)
      ipcRenderer.on(IPC.eventDownloadProgress, listener)
      return () => ipcRenderer.removeListener(IPC.eventDownloadProgress, listener)
    },
    onDownloadDone: (cb: (result: DownloadResult) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, result: DownloadResult): void => cb(result)
      ipcRenderer.on(IPC.eventDownloadDone, listener)
      return () => ipcRenderer.removeListener(IPC.eventDownloadDone, listener)
    },
    onAppUpdateStatus: (cb: (status: AppUpdateStatus) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, status: AppUpdateStatus): void => cb(status)
      ipcRenderer.on(IPC.eventAppUpdateStatus, listener)
      return () => ipcRenderer.removeListener(IPC.eventAppUpdateStatus, listener)
    },
    onContentProgress: (cb: (progress: ContentInstallProgress) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, progress: ContentInstallProgress): void => cb(progress)
      ipcRenderer.on(IPC.eventContentProgress, listener)
      return () => ipcRenderer.removeListener(IPC.eventContentProgress, listener)
    },
    onContentDone: (cb: (result: ContentInstallResult) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, result: ContentInstallResult): void => cb(result)
      ipcRenderer.on(IPC.eventContentDone, listener)
      return () => ipcRenderer.removeListener(IPC.eventContentDone, listener)
    },
    onMapCliProgress: (cb: (progress: DownloadProgress) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, progress: DownloadProgress): void => cb(progress)
      ipcRenderer.on(IPC.eventMapCliProgress, listener)
      return () => ipcRenderer.removeListener(IPC.eventMapCliProgress, listener)
    },
    onMapCliDone: (cb: (result: MapCliInstallResult) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, result: MapCliInstallResult): void => cb(result)
      ipcRenderer.on(IPC.eventMapCliDone, listener)
      return () => ipcRenderer.removeListener(IPC.eventMapCliDone, listener)
    },
    onTailscaleInstallProgress: (cb: (progress: { downloadedBytes: number; totalBytes: number | null }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, progress: { downloadedBytes: number; totalBytes: number | null }): void =>
        cb(progress)
      ipcRenderer.on(IPC.eventTailscaleInstallProgress, listener)
      return () => ipcRenderer.removeListener(IPC.eventTailscaleInstallProgress, listener)
    },
    onTailscaleAuthUrl: (cb: (url: string) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, url: string): void => cb(url)
      ipcRenderer.on(IPC.eventTailscaleAuthUrl, listener)
      return () => ipcRenderer.removeListener(IPC.eventTailscaleAuthUrl, listener)
    },
    onCloudflareInstallProgress: (cb: (progress: { downloadedBytes: number; totalBytes: number | null }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, progress: { downloadedBytes: number; totalBytes: number | null }): void =>
        cb(progress)
      ipcRenderer.on(IPC.eventCloudflareInstallProgress, listener)
      return () => ipcRenderer.removeListener(IPC.eventCloudflareInstallProgress, listener)
    },
    onCloudflareUrl: (cb: (url: string) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, url: string): void => cb(url)
      ipcRenderer.on(IPC.eventCloudflareUrl, listener)
      return () => ipcRenderer.removeListener(IPC.eventCloudflareUrl, listener)
    }
  }
}

export type LauncherApi = typeof api

contextBridge.exposeInMainWorld('launcher', api)
