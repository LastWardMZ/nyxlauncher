import { IPC } from '@shared/types'
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
} from '@shared/types'

// Browser-side stand-in for the preload's `window.launcher`, used only when
// the app is loaded from remoteServer.ts (LAN/Tailscale/Cloudflare) instead
// of an Electron BrowserWindow — there `window.launcher` doesn't exist at
// all, since there's no contextBridge. Same method names/shapes as
// src/preload/index.ts, so every existing component keeps calling
// `window.launcher.xxx()` completely unchanged; only the transport differs:
// one `fetch()` per call instead of `ipcRenderer.invoke`, and one shared
// WebSocket fanning out to the same `events.onXxx` subscribers.

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = await fetch('/api/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ channel, args })
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('nyx-remote-unauthenticated'))
    }
    throw new Error(body.error ?? `Fallo al invocar ${channel}`)
  }
  return body.result as T
}

type EventListener = (payload: unknown) => void
const listeners = new Map<string, Set<EventListener>>()

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const set = listeners.get(channel) ?? new Set()
  const wrapped = cb as EventListener
  set.add(wrapped)
  listeners.set(channel, set)
  return () => set.delete(wrapped)
}

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function connectWebSocket(): void {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${scheme}://${location.host}/ws`)
  ws.addEventListener('message', (event) => {
    try {
      const { channel, payload } = JSON.parse(event.data)
      listeners.get(channel)?.forEach((cb) => cb(payload))
    } catch {
      // ignore malformed frames
    }
  })
  ws.addEventListener('close', () => {
    reconnectTimer = setTimeout(connectWebSocket, 2000)
  })
}

export function createRemoteLauncherClient(): Window['launcher'] {
  connectWebSocket()
  window.addEventListener('beforeunload', () => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
  })

  return {
    servers: {
      list: () => invoke<ServerConfig[]>(IPC.serversList),
      create: (input: CreateServerInput) => invoke<ServerConfig>(IPC.serversCreate, input),
      update: (input: UpdateServerInput) => invoke<ServerConfig>(IPC.serversUpdate, input),
      remove: (id: string) => invoke<void>(IPC.serversDelete, id),
      nextAvailablePort: () => invoke<number | null>(IPC.serversNextAvailablePort)
    },
    config: {
      getDefaults: () => invoke<ConfigDefaults>(IPC.configGetDefaults)
    },
    server: {
      start: (id: string) => invoke<void>(IPC.serverStart, id),
      stop: (id: string) => invoke<void>(IPC.serverStop, id),
      kill: (id: string) => invoke<void>(IPC.serverKill, id),
      restart: (id: string) => invoke<void>(IPC.serverRestart, id),
      sendCommand: (id: string, command: string) => invoke<boolean>(IPC.serverSendCommand, id, command),
      getState: (id: string) => invoke<ServerRuntimeState>(IPC.serverGetState, id),
      getConsoleBuffer: (id: string) => invoke<ConsoleLine[]>(IPC.serverGetConsoleBuffer, id),
      getDiskUsage: (id: string) => invoke<DiskUsageInfo>(IPC.serverGetDiskUsage, id)
    },
    dialogs: {
      // No native OS file/folder picker in a browser — the affected dialogs
      // (choosing an install directory, browsing for a jar) are desktop-only
      // conveniences; they simply return nothing remotely.
      pickDirectory: () => Promise.resolve(null),
      pickFile: () => Promise.resolve(null)
    },
    files: {
      list: (serverId: string, relDir: string) => invoke<FileEntry[]>(IPC.filesList, serverId, relDir),
      readText: (serverId: string, relPath: string) =>
        invoke<ReadTextFileResult | null>(IPC.filesReadText, serverId, relPath),
      writeText: (serverId: string, relPath: string, content: string) =>
        invoke<void>(IPC.filesWriteText, serverId, relPath, content),
      createFile: (serverId: string, relPath: string) => invoke<void>(IPC.filesCreateFile, serverId, relPath),
      createDirectory: (serverId: string, relPath: string) =>
        invoke<void>(IPC.filesCreateDirectory, serverId, relPath),
      rename: (serverId: string, fromRelPath: string, toRelPath: string) =>
        invoke<void>(IPC.filesRename, serverId, fromRelPath, toRelPath),
      remove: (serverId: string, relPath: string) => invoke<void>(IPC.filesDelete, serverId, relPath),
      import: () => Promise.resolve(0),
      export: () => Promise.resolve(false),
      // Unlike import/export, this never touches a native dialog — it just
      // ships bytes the browser already has (drag-and-drop, or a plain
      // <input type="file">), so it works the same here as on desktop.
      upload: (serverId: string, destRelDir: string, fileName: string, base64Content: string) =>
        invoke<void>(IPC.filesUpload, serverId, destRelDir, fileName, base64Content)
    },
    backups: {
      list: (serverId: string) => invoke<BackupEntry[]>(IPC.backupsList, serverId),
      create: (serverId: string) => invoke<BackupEntry>(IPC.backupsCreate, serverId),
      restore: (serverId: string, backupId: string) => invoke<void>(IPC.backupsRestore, serverId, backupId),
      remove: (serverId: string, backupId: string) => invoke<void>(IPC.backupsDelete, serverId, backupId)
    },
    settings: {
      get: () => invoke<AppSettings>(IPC.settingsGet),
      update: (settings: AppSettings) => invoke<AppSettings>(IPC.settingsUpdate, settings)
    },
    system: {
      detectServerJar: (dirAbsPath: string) => invoke<string | null>(IPC.systemDetectServerJar, dirAbsPath),
      checkJavaVersion: (javaPath: string) => invoke<JavaVersionCheck>(IPC.systemCheckJavaVersion, javaPath),
      importServerZip: (zipPath: string, destDir: string) =>
        invoke<ImportServerZipResult>(IPC.systemImportServerZip, zipPath, destDir)
    },
    minecraft: {
      listVersions: (flavor: ServerFlavor) => invoke<MinecraftVersionOption[]>(IPC.minecraftListVersions, flavor),
      listBuilds: (flavor: ServerFlavor, version: string) =>
        invoke<MinecraftBuildOption[]>(IPC.minecraftListBuilds, flavor, version),
      download: (flavor: ServerFlavor, version: string, buildId: string, destDir: string) =>
        invoke<string>(IPC.minecraftDownload, flavor, version, buildId, destDir),
      cancelDownload: (jobId: string) => invoke<void>(IPC.minecraftCancelDownload, jobId)
    },
    proxy: {
      getConfig: (serverId: string) => invoke<ProxyConfigResult>(IPC.proxyGetConfig, serverId),
      saveConfig: (serverId: string, servers: ProxyBackendEntry[], tryOrder: string[]) =>
        invoke<void>(IPC.proxySaveConfig, serverId, servers, tryOrder)
    },
    content: {
      search: (providerId: ContentProvider, params: ContentSearchParams) =>
        invoke<ContentSearchPage>(IPC.contentSearch, providerId, params),
      getProject: (providerId: ContentProvider, projectId: string) =>
        invoke<ContentProjectDetail>(IPC.contentGetProject, providerId, projectId),
      listVersions: (
        providerId: ContentProvider,
        projectId: string,
        loader: string,
        mcVersion: string,
        ignoreCompatibility?: boolean
      ) =>
        invoke<ContentVersion[]>(
          IPC.contentListVersions,
          providerId,
          projectId,
          loader,
          mcVersion,
          ignoreCompatibility
        ),
      install: (
        serverId: string,
        providerId: ContentProvider,
        projectId: string,
        title: string,
        versionId: string,
        ignoreCompatibility?: boolean
      ) =>
        invoke<string>(
          IPC.contentInstall,
          serverId,
          providerId,
          projectId,
          title,
          versionId,
          ignoreCompatibility
        ),
      installModpack: (serverId: string, mrpackPath: string) =>
        invoke<ContentInstallResult>(IPC.contentInstallModpack, serverId, mrpackPath),
      installModpackFromProvider: (
        serverId: string,
        providerId: ContentProvider,
        projectId: string,
        title: string,
        versionId: string,
        ignoreCompatibility?: boolean
      ) =>
        invoke<string>(
          IPC.contentInstallModpackFromProvider,
          serverId,
          providerId,
          projectId,
          title,
          versionId,
          ignoreCompatibility
        ),
      update: (serverId: string, providerId: ContentProvider, projectId: string) =>
        invoke<InstalledContentEntry | null>(IPC.contentUpdate, serverId, providerId, projectId),
      uninstall: (serverId: string, projectId: string) => invoke<void>(IPC.contentUninstall, serverId, projectId),
      listInstalled: (serverId: string) => invoke<InstalledContentEntry[]>(IPC.contentListInstalled, serverId)
    },
    map: {
      getStatus: (serverId: string) => invoke<MapStatus>(IPC.mapGetStatus, serverId),
      install: (serverId: string) => invoke<string>(IPC.mapInstall, serverId),
      activate: (serverId: string) => invoke<void>(IPC.mapActivate, serverId),
      purge: (serverId: string) => invoke<void>(IPC.mapPurge, serverId),
      getUrl: (serverId: string) => invoke<string>(IPC.mapGetUrl, serverId),
      getDiskUsage: (serverId: string) => invoke<number>(IPC.mapGetDiskUsage, serverId),
      cliInstall: (serverId: string) => invoke<string>(IPC.mapCliInstall, serverId),
      cliPrepareConfig: (serverId: string) => invoke<void>(IPC.mapCliPrepareConfig, serverId),
      cliRenderNow: (serverId: string) => invoke<void>(IPC.mapCliRenderNow, serverId),
      cliCancelRender: (serverId: string) => invoke<void>(IPC.mapCliCancelRender, serverId),
      cliResolveWorldPath: (serverId: string) => invoke<string>(IPC.mapCliResolveWorldPath, serverId)
    },
    app: {
      getVersion: () => invoke<string>(IPC.appGetVersion),
      checkForUpdates: () => invoke<void>(IPC.appCheckForUpdates)
    },
    remoteAccess: {
      getServerStatus: () => invoke<RemoteServerStatus>(IPC.remoteServerGetStatus),
      getAuthStatus: () => invoke<RemoteAuthStatus>(IPC.remoteAuthGetStatus),
      setPassword: (username: string, password: string) => invoke<void>(IPC.remoteAuthSetPassword, username, password),
      changePassword: (currentPassword: string, newPassword: string) =>
        invoke<void>(IPC.remoteAuthChangePassword, currentPassword, newPassword),
      changeUsername: (currentPassword: string, newUsername: string) =>
        invoke<void>(IPC.remoteAuthChangeUsername, currentPassword, newUsername),
      listSessions: () => invoke<RemoteSessionInfo[]>(IPC.remoteSessionsList),
      revokeSession: (id: string) => invoke<void>(IPC.remoteSessionsRevoke, id),
      revokeAllSessions: () => invoke<void>(IPC.remoteSessionsRevokeAll)
    },
    tailscale: {
      getStatus: () => invoke<TailscaleStatus>(IPC.tailscaleGetStatus),
      install: () => invoke<void>(IPC.tailscaleInstall),
      connect: () => invoke<void>(IPC.tailscaleConnect),
      disconnect: () => invoke<void>(IPC.tailscaleDisconnect)
    },
    totp: {
      begin: () => invoke<TotpSetupInfo>(IPC.totpBegin),
      verify: (code: string) => invoke<boolean>(IPC.totpVerify, code),
      disable: (password: string) => invoke<void>(IPC.totpDisable, password)
    },
    devices: {
      list: () => invoke<TrustedDeviceInfo[]>(IPC.devicesList),
      revoke: (id: string) => invoke<void>(IPC.devicesRevoke, id)
    },
    accessLog: {
      list: () => invoke<AccessLogEntry[]>(IPC.accessLogList)
    },
    email: {
      getStatus: () => invoke<EmailConfigStatus>(IPC.emailGetStatus),
      setApiKey: (apiKey: string) => invoke<void>(IPC.emailSetApiKey, apiKey)
    },
    cloudflare: {
      getStatus: () => invoke<CloudflareStatus>(IPC.cloudflareGetStatus),
      install: () => invoke<void>(IPC.cloudflareInstall),
      connectQuick: () => invoke<void>(IPC.cloudflareConnectQuick),
      connectDomain: (domain: string, apiToken: string) => invoke<void>(IPC.cloudflareConnectDomain, domain, apiToken),
      disconnect: () => invoke<void>(IPC.cloudflareDisconnect)
    },
    caddy: {
      checkDns: (domain: string) => invoke<{ resolves: boolean; addresses: string[] }>(IPC.caddyCheckDns, domain),
      install: () => invoke<void>(IPC.caddyInstall),
      start: (domain: string) => invoke<void>(IPC.caddyStart, domain),
      stop: () => invoke<void>(IPC.caddyStop),
      getStatus: () => invoke<{ installed: boolean; running: boolean }>(IPC.caddyGetStatus)
    },
    events: {
      onConsoleLine: (cb: (line: ConsoleLine) => void) => subscribe(IPC.eventConsoleLine, cb),
      onStateChanged: (cb: (state: ServerRuntimeState) => void) => subscribe(IPC.eventStateChanged, cb),
      onDownloadProgress: (cb: (progress: DownloadProgress) => void) => subscribe(IPC.eventDownloadProgress, cb),
      onDownloadDone: (cb: (result: DownloadResult) => void) => subscribe(IPC.eventDownloadDone, cb),
      onAppUpdateStatus: (cb: (status: AppUpdateStatus) => void) => subscribe(IPC.eventAppUpdateStatus, cb),
      onContentProgress: (cb: (progress: ContentInstallProgress) => void) => subscribe(IPC.eventContentProgress, cb),
      onContentDone: (cb: (result: ContentInstallResult) => void) => subscribe(IPC.eventContentDone, cb),
      onMapCliProgress: (cb: (progress: DownloadProgress) => void) => subscribe(IPC.eventMapCliProgress, cb),
      onMapCliDone: (cb: (result: MapCliInstallResult) => void) => subscribe(IPC.eventMapCliDone, cb),
      onTailscaleInstallProgress: (cb: (progress: { downloadedBytes: number; totalBytes: number | null }) => void) =>
        subscribe(IPC.eventTailscaleInstallProgress, cb),
      onTailscaleAuthUrl: (cb: (url: string) => void) => subscribe(IPC.eventTailscaleAuthUrl, cb),
      onCloudflareInstallProgress: (cb: (progress: { downloadedBytes: number; totalBytes: number | null }) => void) =>
        subscribe(IPC.eventCloudflareInstallProgress, cb),
      onCloudflareUrl: (cb: (url: string) => void) => subscribe(IPC.eventCloudflareUrl, cb)
    }
  }
}
