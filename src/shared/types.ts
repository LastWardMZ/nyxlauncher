// Types shared between the Electron main process and the renderer (React) app.
// Kept framework-agnostic on purpose: the app manages a generic child process
// (name, working directory, executable, args) rather than anything hardcoded
// to a particular server binary/launch convention — Paper, Purpur, Velocity,
// vanilla, or any other jar someone points it at.

export type ServerStatus = 'stopped' | 'starting' | 'online' | 'stopping' | 'error' | 'crashed'

export interface JavaRuntimeConfig {
  /** Path to a java executable, or empty/"java" to rely on PATH. Ignored for non-JVM launch modes. */
  javaPath: string
  minMemoryMb: number
  maxMemoryMb: number
  /** Extra raw JVM args, e.g. "-XX:+UseG1GC" */
  extraArgs: string
}

export type LaunchMode = 'command' | 'jar'

/** Which server software this is. Drives the built-in downloader and the Proxy tab. */
export type ServerFlavor =
  | 'vanilla'
  | 'fabric'
  | 'forge'
  | 'neoforge'
  | 'purpur'
  | 'paper'
  | 'folia'
  | 'velocity'
  | 'bungeecord'
  | 'other'

/** Whether a flavor is a Minecraft server or a proxy (drives the type picker + Proxy tab). */
export type ServerCategory = 'server' | 'proxy'

export const FLAVOR_CATEGORY: Record<ServerFlavor, ServerCategory> = {
  vanilla: 'server',
  fabric: 'server',
  forge: 'server',
  neoforge: 'server',
  purpur: 'server',
  paper: 'server',
  folia: 'server',
  velocity: 'proxy',
  bungeecord: 'proxy',
  other: 'server'
}

export const FLAVOR_LABELS: Record<ServerFlavor, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  purpur: 'Purpur',
  paper: 'Paper',
  folia: 'Folia',
  velocity: 'Velocity (proxy)',
  bungeecord: 'BungeeCord (proxy)',
  other: 'Otro / personalizado'
}

/**
 * Filenames (relative to the server's working directory) used by the
 * Players panel. These are the real vanilla/Paper/Purpur filenames.
 */
export interface PlayerListFilesConfig {
  whitelist: string
  ops: string
  banned: string
}

/** Allowed cadences for scheduled backups; null means "disabled". */
export type BackupScheduleHours = 6 | 12 | 24 | 48 | 168 | null

export interface BackupConfig {
  /** Path relative to workingDirectory to back up; '' backs up the whole server folder. */
  sourcePath: string
  scheduleHours: BackupScheduleHours
}

export interface BackupEntry {
  id: string
  fileName: string
  sizeBytes: number
  createdAt: string
  sourcePath: string
}

/** Allowed cadences for automatic "is there a newer build" checks; null means "disabled". */
export type UpdateCheckHours = 1 | 6 | 24 | null

export interface UpdateCheckConfig {
  /** How often to poll the Paper/Purpur/Velocity API for a newer build of the installed version. */
  autoCheckHours: UpdateCheckHours
}

/** What the launcher installed via the built-in downloader, if anything — powers the update checker. */
export interface InstalledBuildInfo {
  flavor: ServerFlavor
  version: string
  buildId: string
}

export interface ServerConfig {
  id: string
  name: string
  /** Directory the process is spawned in; also the root the file manager/backups operate on. */
  workingDirectory: string
  launchMode: LaunchMode
  /**
   * launchMode "command": full executable/binary path (args below are appended).
   * launchMode "jar": path to a .jar launched via the configured Java runtime.
   */
  executable: string
  args: string[]
  java: JavaRuntimeConfig
  port: number | null
  autoRestart: boolean
  flavor: ServerFlavor
  installedBuild: InstalledBuildInfo | null
  /** Relative path (within workingDirectory) to the server's main properties file. */
  configFilePath: string
  playerListFiles: PlayerListFilesConfig
  backup: BackupConfig
  updateCheck: UpdateCheckConfig
  createdAt: string
  updatedAt: string
}

export interface ServerMetrics {
  cpuPercent: number
  memoryMb: number
  uptimeSeconds: number
}

export interface ServerRuntimeState {
  id: string
  status: ServerStatus
  pid: number | null
  startedAt: string | null
  metrics: ServerMetrics | null
  lastExitCode: number | null
}

export type ConsoleLineStream = 'stdout' | 'stderr' | 'system'

export interface ConsoleLine {
  id: string
  serverId: string
  stream: ConsoleLineStream
  text: string
  timestamp: string
}

export interface CreateServerInput {
  name: string
  workingDirectory: string
  launchMode: LaunchMode
  executable: string
  args: string[]
  java: JavaRuntimeConfig
  port: number | null
  autoRestart: boolean
  flavor: ServerFlavor
  installedBuild: InstalledBuildInfo | null
  configFilePath: string
  playerListFiles: PlayerListFilesConfig
  backup: BackupConfig
  updateCheck: UpdateCheckConfig
}

export interface UpdateServerInput extends CreateServerInput {
  id: string
}

export const DEFAULT_PLAYER_LIST_FILES: PlayerListFilesConfig = {
  whitelist: 'whitelist.json',
  ops: 'ops.json',
  banned: 'banned-players.json'
}

export const DEFAULT_CONFIG_FILE_PATH = 'server.properties'

/** Default Minecraft Java Edition server port (TCP). */
export const MINECRAFT_DEFAULT_PORT = 25565

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  sourcePath: '',
  scheduleHours: null
}

export const DEFAULT_UPDATE_CHECK_CONFIG: UpdateCheckConfig = {
  autoCheckHours: null
}

/** App-wide preferences, independent of any single server. */
export interface AppSettings {
  notificationsEnabled: boolean
  launchOnStartup: boolean
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  notificationsEnabled: true,
  launchOnStartup: false
}

export interface FileEntry {
  name: string
  /** Path relative to the server's working directory, using forward slashes. */
  relPath: string
  isDirectory: boolean
  size: number
  modifiedAt: string
}

export interface ReadTextFileResult {
  content: string
  truncated: boolean
}

export interface JavaVersionCheck {
  available: boolean
  majorVersion: number | null
  raw: string | null
}

export interface ImportServerZipResult {
  destDir: string
  /** Auto-detected single .jar in the extracted folder, if any. */
  executable: string | null
}

// ---------------------------------------------------------------------------
// Built-in Minecraft server downloader (Paper/Purpur/Velocity/vanilla). All
// four projects publish free, unauthenticated JSON APIs, so — unlike Hytale —
// the launcher can fetch server jars directly with no external tool and no
// login. See src/main/minecraftDownloader.ts for the actual API calls.
// ---------------------------------------------------------------------------

export interface MinecraftVersionOption {
  id: string
  /** Grouping label for the picker, e.g. the major release line. */
  group: string
}

export type BuildChannel = 'STABLE' | 'BETA' | 'ALPHA' | 'RECOMMENDED' | 'UNKNOWN'

export interface MinecraftBuildOption {
  id: string
  channel: BuildChannel
  time: string | null
}

export interface DownloadProgress {
  jobId: string
  downloadedBytes: number
  totalBytes: number | null
}

export interface DownloadResult {
  jobId: string
  success: boolean
  error: string | null
  destDir: string
  executable: string
  /** Forge/NeoForge run through their installer and end up launched via a run script, not a bare jar. */
  launchMode: LaunchMode
  installedBuild: InstalledBuildInfo | null
  javaMajorVersion: number | null
}

// ---------------------------------------------------------------------------
// Velocity proxy support (the "Proxy" tab, shown for flavor === 'velocity').
// ---------------------------------------------------------------------------

export interface ProxyBackendEntry {
  name: string
  /** host:port, e.g. "127.0.0.1:25566" */
  address: string
}

export interface ProxyConfigResult {
  exists: boolean
  servers: ProxyBackendEntry[]
  /** Priority order the proxy sends new players through. */
  tryOrder: string[]
}

// ---------------------------------------------------------------------------
// Content manager (search/install/update/uninstall plugins, mods, modpacks).
// Modrinth v2 is the first provider (free, no API key); CurseForge is a
// registered-but-disabled second provider behind CURSEFORGE_ENABLED in
// src/main/content/providers.ts, since it needs a paid key. See
// src/main/content/contentManager.ts for the actual install/update logic.
// ---------------------------------------------------------------------------

export type ContentProvider = 'modrinth' | 'curseforge'

export type ContentProjectType = 'mod' | 'plugin'

/** Maps a server flavor to the Modrinth loader slug — they happen to match 1:1 for every
 * flavor we support content for. vanilla/other are deliberately absent: no content support. */
export const FLAVOR_TO_LOADER: Partial<Record<ServerFlavor, string>> = {
  paper: 'paper',
  purpur: 'purpur',
  folia: 'folia',
  fabric: 'fabric',
  forge: 'forge',
  neoforge: 'neoforge',
  velocity: 'velocity',
  bungeecord: 'bungeecord'
}

export const FLAVOR_CONTENT_TYPE: Partial<Record<ServerFlavor, ContentProjectType>> = {
  paper: 'plugin',
  purpur: 'plugin',
  folia: 'plugin',
  velocity: 'plugin',
  bungeecord: 'plugin',
  fabric: 'mod',
  forge: 'mod',
  neoforge: 'mod'
}

export interface ContentSearchParams {
  query: string
  projectType: ContentProjectType
  loader: string
  mcVersion: string
  /** Advanced mode: skip the loader/version compatibility facets, just search everything. */
  ignoreCompatibility?: boolean
  categories?: string[]
  sort?: 'relevance' | 'downloads' | 'updated' | 'newest'
  offset?: number
}

export interface ContentSearchHit {
  projectId: string
  slug: string
  title: string
  description: string
  author: string
  iconUrl: string | null
  downloads: number
  categories: string[]
}

export interface ContentSearchPage {
  hits: ContentSearchHit[]
  totalHits: number
}

export interface ContentGalleryImage {
  url: string
  title: string | null
  description: string | null
}

/** Extra detail not already present in a ContentSearchHit — fetched on demand when the user clicks a result. */
export interface ContentProjectDetail {
  projectId: string
  /** Full markdown README/description, longer than ContentSearchHit.description. */
  body: string
  followers: number
  gallery: ContentGalleryImage[]
}

export interface ContentDependency {
  projectId: string | null
  versionId: string | null
  dependencyType: 'required' | 'optional' | 'incompatible' | 'embedded'
}

export interface ContentVersion {
  versionId: string
  projectId: string
  versionNumber: string
  fileName: string
  url: string
  sha1: string
  loaders: string[]
  gameVersions: string[]
  dependencies: ContentDependency[]
  datePublished: string
}

export interface InstalledContentEntry {
  projectId: string
  projectType: ContentProjectType
  provider: ContentProvider
  versionId: string
  versionNumber: string
  fileName: string
  sha1: string
  installedAt: string
  loader: string
  mcVersion: string
  title: string
  iconUrl: string | null
  isDependency: boolean
}

export interface ContentInstallProgress {
  jobId: string
  projectId: string
  title: string
  downloadedBytes: number
  totalBytes: number | null
}

export interface ContentInstallResult {
  jobId: string
  success: boolean
  error: string | null
  installed: InstalledContentEntry[]
}

// ---------------------------------------------------------------------------
// Auto-update (electron-updater, publishing to GitHub Releases).
// ---------------------------------------------------------------------------

export type AppUpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

// IPC channel names, centralized so main/preload/renderer stay in sync.
export const IPC = {
  serversList: 'servers:list',
  serversCreate: 'servers:create',
  serversUpdate: 'servers:update',
  serversDelete: 'servers:delete',
  serverStart: 'server:start',
  serverStop: 'server:stop',
  serverKill: 'server:kill',
  serverRestart: 'server:restart',
  serverSendCommand: 'server:sendCommand',
  serverGetState: 'server:getState',
  serverGetConsoleBuffer: 'server:getConsoleBuffer',
  dialogPickDirectory: 'dialog:pickDirectory',
  dialogPickFile: 'dialog:pickFile',
  eventConsoleLine: 'event:consoleLine',
  eventStateChanged: 'event:stateChanged',
  eventMetrics: 'event:metrics',

  filesList: 'files:list',
  filesReadText: 'files:readText',
  filesWriteText: 'files:writeText',
  filesCreateFile: 'files:createFile',
  filesCreateDirectory: 'files:createDirectory',
  filesRename: 'files:rename',
  filesDelete: 'files:delete',
  filesImport: 'files:import',
  filesExport: 'files:export',

  backupsList: 'backups:list',
  backupsCreate: 'backups:create',
  backupsRestore: 'backups:restore',
  backupsDelete: 'backups:delete',
  eventBackupProgress: 'event:backupProgress',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  systemDetectServerJar: 'system:detectServerJar',
  systemCheckJavaVersion: 'system:checkJavaVersion',
  systemImportServerZip: 'system:importServerZip',

  minecraftListVersions: 'minecraft:listVersions',
  minecraftListBuilds: 'minecraft:listBuilds',
  minecraftDownload: 'minecraft:download',
  minecraftCancelDownload: 'minecraft:cancelDownload',
  minecraftCheckLatestBuild: 'minecraft:checkLatestBuild',
  eventDownloadProgress: 'event:downloadProgress',
  eventDownloadDone: 'event:downloadDone',

  proxyGetConfig: 'proxy:getConfig',
  proxySaveConfig: 'proxy:saveConfig',

  contentSearch: 'content:search',
  contentGetProject: 'content:getProject',
  contentListVersions: 'content:listVersions',
  contentInstall: 'content:install',
  contentInstallModpack: 'content:installModpack',
  contentUpdate: 'content:update',
  contentUninstall: 'content:uninstall',
  contentListInstalled: 'content:listInstalled',
  eventContentProgress: 'event:contentProgress',
  eventContentDone: 'event:contentDone',

  appGetVersion: 'app:getVersion',
  appCheckForUpdates: 'app:checkForUpdates',
  eventAppUpdateStatus: 'event:appUpdateStatus'
} as const
