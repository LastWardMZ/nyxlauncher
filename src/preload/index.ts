import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  AppSettings,
  AppUpdateStatus,
  BackupEntry,
  ConsoleLine,
  CreateServerInput,
  DownloadProgress,
  DownloadResult,
  FileEntry,
  ImportServerZipResult,
  JavaVersionCheck,
  MinecraftBuildOption,
  MinecraftVersionOption,
  ProxyBackendEntry,
  ProxyConfigResult,
  ReadTextFileResult,
  ServerConfig,
  ServerFlavor,
  ServerRuntimeState,
  UpdateServerInput
} from '../shared/types'

const api = {
  servers: {
    list: (): Promise<ServerConfig[]> => ipcRenderer.invoke(IPC.serversList),
    create: (input: CreateServerInput): Promise<ServerConfig> =>
      ipcRenderer.invoke(IPC.serversCreate, input),
    update: (input: UpdateServerInput): Promise<ServerConfig> =>
      ipcRenderer.invoke(IPC.serversUpdate, input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serversDelete, id)
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
      ipcRenderer.invoke(IPC.serverGetConsoleBuffer, id)
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
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appGetVersion),
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC.appCheckForUpdates)
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
    }
  }
}

export type LauncherApi = typeof api

contextBridge.exposeInMainWorld('launcher', api)
