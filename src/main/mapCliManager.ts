import { promises as fs } from 'fs'
import { spawn } from 'child_process'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import treeKill from 'tree-kill'
import { safeResolve } from './fileManagerCore'
import { downloadFile } from './downloadFile'
import { checkJavaVersion } from './serverDetect'
import { serverManager } from './serverManager'
import { patchHoconBoolean, readHoconBoolean, WEB_DIR_REL } from './mapManager'
import { parseProperties } from '../shared/propertiesFile'
import type { DownloadProgress, JavaVersionCheck, MapCliInstallResult, MapStatus, ServerConfig } from '../shared/types'

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/BlueMap-Minecraft/BlueMap/releases/latest'
const CACHE_TTL_MS = 5 * 60 * 1000
const JAVA_MIN_VERSION = 25 // BlueMap CLI's own requirement, independent of whatever Java the server itself uses.
const CLI_DIR_REL = 'bluemap-cli'
const RENDER_STATE_NAME = 'render-state.json'

interface RenderState {
  cliVersion: string | null
  lastRenderedAt: string | null
  lastRenderStatus: 'success' | 'error' | null
  lastError: string | null
}

const DEFAULT_RENDER_STATE: RenderState = {
  cliVersion: null,
  lastRenderedAt: null,
  lastRenderStatus: null,
  lastError: null
}

function exists(absPath: string): Promise<boolean> {
  return fs
    .access(absPath)
    .then(() => true)
    .catch(() => false)
}

function cliConfigDir(server: ServerConfig): string {
  return safeResolve(server.workingDirectory, CLI_DIR_REL)
}

function cliJarPath(server: ServerConfig): string {
  return join(cliConfigDir(server), 'bluemap-cli.jar')
}

function renderStatePath(server: ServerConfig): string {
  return join(cliConfigDir(server), RENDER_STATE_NAME)
}

async function readRenderState(server: ServerConfig): Promise<RenderState> {
  try {
    const raw = await fs.readFile(renderStatePath(server), 'utf8')
    return { ...DEFAULT_RENDER_STATE, ...(JSON.parse(raw) as Partial<RenderState>) }
  } catch {
    return DEFAULT_RENDER_STATE
  }
}

async function writeRenderState(server: ServerConfig, state: RenderState): Promise<void> {
  await fs.mkdir(cliConfigDir(server), { recursive: true })
  await fs.writeFile(renderStatePath(server), JSON.stringify(state, null, 2), 'utf8')
}

let releaseCache: { data: { version: string; downloadUrl: string }; expiresAt: number } | null = null

export async function fetchLatestCliRelease(): Promise<{ version: string; downloadUrl: string }> {
  if (releaseCache && releaseCache.expiresAt > Date.now()) return releaseCache.data

  const res = await fetch(GITHUB_RELEASES_URL, {
    headers: { 'User-Agent': 'NyxLauncher (github.com/LastWardMZ/nyxlauncher)', Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub Releases -> HTTP ${res.status}`)
  const release = (await res.json()) as { tag_name: string; assets: { name: string; browser_download_url: string }[] }
  const asset = release.assets.find((a) => /-cli\.jar$/.test(a.name))
  if (!asset) throw new Error('No se encontró el jar del CLI de BlueMap en la última release')

  const data = { version: release.tag_name.replace(/^v/, ''), downloadUrl: asset.browser_download_url }
  releaseCache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
  return data
}

export function isCliInstalled(server: ServerConfig): Promise<boolean> {
  return exists(cliJarPath(server))
}

class MapCliInstaller extends EventEmitter {
  async install(server: ServerConfig): Promise<string> {
    const jobId = randomUUID()
    void this.run(jobId, server)
    return jobId
  }

  private async run(jobId: string, server: ServerConfig): Promise<void> {
    try {
      const { version, downloadUrl } = await fetchLatestCliRelease()
      await fs.mkdir(cliConfigDir(server), { recursive: true })
      await downloadFile(downloadUrl, cliJarPath(server), (downloadedBytes, totalBytes) => {
        this.emit('progress', { jobId, downloadedBytes, totalBytes } satisfies DownloadProgress)
      })
      const state = await readRenderState(server)
      await writeRenderState(server, { ...state, cliVersion: version })
      this.emit('done', { jobId, success: true, error: null, cliVersion: version } satisfies MapCliInstallResult)
    } catch (err) {
      this.emit('done', { jobId, success: false, error: (err as Error).message, cliVersion: null } satisfies MapCliInstallResult)
    }
  }
}

export const mapCliInstaller = new MapCliInstaller()

export function checkJavaForCli(server: ServerConfig): Promise<JavaVersionCheck> {
  return checkJavaVersion(server.java.javaPath || 'java')
}

async function patchHoconString(absPath: string, key: string, value: string): Promise<void> {
  const text = await fs.readFile(absPath, 'utf8')
  const pattern = new RegExp(`^(${key}\\s*:\\s*)"[^"]*"`, 'm')
  if (!pattern.test(text)) throw new Error(`No se encontró la clave "${key}" en ${absPath}`)
  await fs.writeFile(absPath, text.replace(pattern, `$1"${value}"`), 'utf8')
}

/** Runs the CLI with no flags beyond -c to generate its default config files, then verifies
 * success by checking core.conf actually appeared — the CLI's exit code on this "just
 * generate config" pass isn't a trustworthy signal on its own.
 *
 * Also repoints the CLI's own default output location. Confirmed empirically (a real
 * bootstrap + render against a real vanilla server): the CLI's default webapp.conf/
 * storages/file.conf write to "web"/"web/maps" (relative to cwd), NOT "bluemap/web" like
 * the plugin/mod path's default — despite both defaulting to a cwd-relative path the same
 * way. Repointing both to "bluemap/web"(/maps) here means the render lands in the exact
 * same place mapHttpServer.ts and mapManager.ts's WEB_DIR_REL already serve/purge, so
 * neither needs any vanilla-specific branching. */
async function bootstrapCliConfig(server: ServerConfig): Promise<void> {
  const javaBin = server.java.javaPath || 'java'
  const tail = await runCli(javaBin, cliJarPath(server), server.workingDirectory, ['-c', CLI_DIR_REL])
  if (!(await exists(join(cliConfigDir(server), 'core.conf')))) {
    throw new Error(`BlueMap CLI no generó su configuración${tail ? `: ${tail.trim().slice(-300)}` : ''}`)
  }
  await patchHoconString(join(cliConfigDir(server), 'webapp.conf'), 'webroot', 'bluemap/web')
  await patchHoconString(join(cliConfigDir(server), 'webserver.conf'), 'webroot', 'bluemap/web')
  await patchHoconString(join(cliConfigDir(server), 'storages', 'file.conf'), 'root', 'bluemap/web/maps')
}

function runCli(javaBin: string, jarPath: string, cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // No shell involved (bare java binary + an args array, not a .bat) — paths with
    // spaces are passed as discrete OS-level arguments, no quoting needed here.
    const proc = spawn(javaBin, ['-jar', jarPath, ...args], { cwd, windowsHide: true })
    let tail = ''
    proc.stdout?.on('data', (c: Buffer) => {
      tail = (tail + c.toString('utf8')).slice(-2000)
    })
    proc.stderr?.on('data', (c: Buffer) => {
      tail = (tail + c.toString('utf8')).slice(-2000)
    })
    proc.on('error', reject)
    proc.on('exit', () => resolve(tail))
  })
}

export async function resolveWorldPath(server: ServerConfig): Promise<string> {
  if (server.mapRender.worldPath) return server.mapRender.worldPath
  try {
    const propsPath = safeResolve(server.workingDirectory, server.configFilePath)
    const text = await fs.readFile(propsPath, 'utf8')
    const levelName = parseProperties(text).get('level-name')
    return levelName?.trim() || 'world'
  } catch {
    return 'world'
  }
}

interface DetectedWorld {
  id: 'overworld' | 'nether' | 'end'
  relPath: string
  label: string
}

/** Vanilla's own dimension-folder naming is fixed by the game itself, not independently
 * configurable — but it's DIM-1 (Nether) / DIM1 (The End) *nested inside* the main world
 * folder, not sibling folders like "<name>_nether" (that convention is Bukkit/Paper's own
 * multi-world split, confirmed different from real vanilla by booting an actual 1.21.11
 * vanilla server and inspecting the resulting folder tree — vanilla still uses the game's
 * original internal dimension IDs here even though newer snapshot versions have started
 * moving everything under a world/dimensions/minecraft/<name>/ layout instead; DIM-1/DIM1
 * is what a current stable release still produces). */
export async function detectWorldFolders(server: ServerConfig): Promise<DetectedWorld[]> {
  const base = await resolveWorldPath(server)
  const candidates: DetectedWorld[] = [
    { id: 'overworld', relPath: base, label: 'Overworld' },
    { id: 'nether', relPath: `${base}/DIM-1`, label: 'Nether' },
    { id: 'end', relPath: `${base}/DIM1`, label: 'End' }
  ]
  const checks = await Promise.all(candidates.map((c) => exists(safeResolve(server.workingDirectory, c.relPath))))
  return candidates.filter((_, i) => checks[i])
}

async function writeMapConfigs(server: ServerConfig, worlds: DetectedWorld[]): Promise<void> {
  const mapsDir = join(cliConfigDir(server), 'maps')
  await fs.mkdir(mapsDir, { recursive: true })
  for (const world of worlds) {
    const worldAbsPath = safeResolve(server.workingDirectory, world.relPath).replace(/\\/g, '\\\\')
    const conf = `world: "${worldAbsPath}"\nname: "${world.label}"\n`
    await fs.writeFile(join(mapsDir, `${world.id}.conf`), conf, 'utf8')
  }
}

/** Orchestrates everything needed before a render can run: generate default config if
 * missing, accept the Mojang asset download, detect world folders, and write a map config
 * for each. Safe to call again later (e.g. after the user adds a new dimension). */
export async function prepareConfig(server: ServerConfig): Promise<void> {
  if (!(await exists(join(cliConfigDir(server), 'core.conf')))) {
    await bootstrapCliConfig(server)
  }
  await patchHoconBoolean(join(cliConfigDir(server), 'core.conf'), 'accept-download', true)

  const worlds = await detectWorldFolders(server)
  if (worlds.length === 0) {
    throw new Error(
      `No se encontró la carpeta del mundo ("${await resolveWorldPath(server)}"). Comprueba la ruta en la configuración del mapa.`
    )
  }
  await writeMapConfigs(server, worlds)
}

async function isConfigPrepared(server: ServerConfig): Promise<boolean> {
  const coreConfPath = join(cliConfigDir(server), 'core.conf')
  if (!(await exists(coreConfPath))) return false
  if ((await readHoconBoolean(coreConfPath, 'accept-download')) !== true) return false
  try {
    const files = await fs.readdir(join(cliConfigDir(server), 'maps'))
    return files.some((f) => f.endsWith('.conf'))
  } catch {
    return false
  }
}

/** Fires 'done' with {server, success} whenever a render (manual or scheduled) finishes —
 * index.ts subscribes once to show a notification, regardless of what triggered it. */
export const mapCliRenderEvents = new EventEmitter()

const runningRenders = new Map<string, { pid: number; startedAt: string }>()

export function isRendering(serverId: string): boolean {
  return runningRenders.has(serverId)
}

export function getRenderStartedAt(serverId: string): string | null {
  return runningRenders.get(serverId)?.startedAt ?? null
}

export async function startRender(server: ServerConfig): Promise<void> {
  if (runningRenders.has(server.id)) throw new Error('Ya hay un render en curso para este servidor')

  const javaBin = server.java.javaPath || 'java'
  const proc = spawn(javaBin, ['-jar', cliJarPath(server), '-c', CLI_DIR_REL, '-r'], {
    cwd: server.workingDirectory,
    windowsHide: true
  })
  if (!proc.pid) throw new Error('No se pudo iniciar el proceso de renderizado')

  const startedAt = new Date().toISOString()
  runningRenders.set(server.id, { pid: proc.pid, startedAt })

  let tail = ''
  proc.stdout?.on('data', (c: Buffer) => {
    tail = (tail + c.toString('utf8')).slice(-2000)
  })
  proc.stderr?.on('data', (c: Buffer) => {
    tail = (tail + c.toString('utf8')).slice(-2000)
  })
  proc.on('exit', (code) => {
    runningRenders.delete(server.id)
    void readRenderState(server)
      .then((prev) =>
        writeRenderState(server, {
          cliVersion: prev.cliVersion,
          // Keep the previous successful timestamp on failure — the scheduler's "due"
          // calculation is based on the last *successful* render, same as backupScheduler.
          lastRenderedAt: code === 0 ? new Date().toISOString() : prev.lastRenderedAt,
          lastRenderStatus: code === 0 ? 'success' : 'error',
          lastError: code === 0 ? null : tail.trim().slice(-500) || `código de salida ${code}`
        })
      )
      .then(() => mapCliRenderEvents.emit('done', { server, success: code === 0 }))
  })
  proc.on('error', () => {
    runningRenders.delete(server.id)
  })
}

export function cancelRender(serverId: string): void {
  const entry = runningRenders.get(serverId)
  if (!entry) return
  treeKill(entry.pid, 'SIGKILL')
  runningRenders.delete(serverId)
}

export async function getVanillaMapStatus(server: ServerConfig): Promise<MapStatus> {
  const serverRunning = serverManager.isRunning(server.id)
  const rendering = isRendering(server.id)
  const renderStartedAt = getRenderStartedAt(server.id)

  try {
    const webIndexPath = safeResolve(server.workingDirectory, `${WEB_DIR_REL}/web/index.html`)
    const state = await readRenderState(server)
    const javaCheck = await checkJavaForCli(server)

    if (await exists(webIndexPath)) {
      return {
        phase: 'ready',
        serverRunning,
        installedVersion: state.cliVersion,
        error: null,
        javaCheck,
        rendering,
        renderStartedAt,
        lastRenderedAt: state.lastRenderedAt,
        lastRenderStatus: state.lastRenderStatus,
        worldsDetected: (await detectWorldFolders(server)).map((w) => w.label)
      }
    }

    if (rendering) {
      return {
        phase: 'rendering',
        serverRunning,
        installedVersion: state.cliVersion,
        error: null,
        javaCheck,
        rendering,
        renderStartedAt,
        lastRenderedAt: state.lastRenderedAt,
        lastRenderStatus: state.lastRenderStatus,
        worldsDetected: []
      }
    }

    if (!(await isCliInstalled(server))) {
      return {
        phase: 'cli-not-installed',
        serverRunning,
        installedVersion: null,
        error: null,
        javaCheck,
        rendering,
        renderStartedAt,
        lastRenderedAt: null,
        lastRenderStatus: null,
        worldsDetected: []
      }
    }

    if (!javaCheck.available || (javaCheck.majorVersion ?? 0) < JAVA_MIN_VERSION) {
      return {
        phase: 'java-incompatible',
        serverRunning,
        installedVersion: state.cliVersion,
        error: null,
        javaCheck,
        rendering,
        renderStartedAt,
        lastRenderedAt: state.lastRenderedAt,
        lastRenderStatus: state.lastRenderStatus,
        worldsDetected: []
      }
    }

    if (!(await isConfigPrepared(server))) {
      return {
        phase: 'cli-needs-config',
        serverRunning,
        installedVersion: state.cliVersion,
        error: null,
        javaCheck,
        rendering,
        renderStartedAt,
        lastRenderedAt: state.lastRenderedAt,
        lastRenderStatus: state.lastRenderStatus,
        worldsDetected: []
      }
    }

    if (state.lastRenderStatus === 'error') {
      return {
        phase: 'error',
        serverRunning,
        installedVersion: state.cliVersion,
        error: state.lastError,
        javaCheck,
        rendering,
        renderStartedAt,
        lastRenderedAt: state.lastRenderedAt,
        lastRenderStatus: state.lastRenderStatus,
        worldsDetected: []
      }
    }

    return {
      phase: 'cli-ready',
      serverRunning,
      installedVersion: state.cliVersion,
      error: null,
      javaCheck,
      rendering,
      renderStartedAt,
      lastRenderedAt: state.lastRenderedAt,
      lastRenderStatus: state.lastRenderStatus,
      worldsDetected: (await detectWorldFolders(server)).map((w) => w.label)
    }
  } catch (err) {
    return {
      phase: 'error',
      serverRunning,
      installedVersion: null,
      error: (err as Error).message,
      javaCheck: null,
      rendering,
      renderStartedAt,
      lastRenderedAt: null,
      lastRenderStatus: null,
      worldsDetected: []
    }
  }
}
