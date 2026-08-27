import { promises as fs } from 'fs'
import { safeResolve } from './fileManagerCore'
import { getDirectorySizeBytes } from './diskUsage'
import { contentManager } from './content/contentManager'
import { getProvider } from './content/providers'
import { serverManager } from './serverManager'
import { FLAVOR_CONTENT_TYPE, FLAVOR_TO_LOADER } from '../shared/types'
import type { MapStatus, ServerConfig } from '../shared/types'

const BLUEMAP_PROJECT_ID = 'bluemap'
// The webroot/rendered-tiles output defaults to a fixed "bluemap/web" path
// relative to the server's working directory regardless of loader (BlueMap's
// own webapp.conf/storages default to this) — confirmed on a real Paper
// server. Only the *config* location depends on how it was installed: a
// Bukkit/Paper-family plugin stores its config under plugins/<Name>/ like
// any other plugin (confirmed: plugins/BlueMap/core.conf, not bluemap/core.conf
// as BlueMap's own docs implied); a Fabric/Forge/NeoForge mod stores it under
// config/ instead, following that ecosystem's convention.
const WEB_DIR_REL = 'bluemap'
const WEB_INDEX_REL = 'bluemap/web/index.html'

function getConfigDirRel(server: ServerConfig): string {
  const type = FLAVOR_CONTENT_TYPE[server.flavor]
  return type === 'mod' ? 'config/bluemap' : 'plugins/BlueMap'
}

function exists(absPath: string): Promise<boolean> {
  return fs
    .access(absPath)
    .then(() => true)
    .catch(() => false)
}

/**
 * BlueMap's config files are plain HOCON with a handful of top-level
 * `key: value` lines. We only ever need to flip two known booleans, so a
 * line-based find/replace is enough — pulling in a full HOCON parser for
 * that would be a new dependency for something this narrow.
 */
async function readHoconBoolean(absPath: string, key: string): Promise<boolean | null> {
  const text = await fs.readFile(absPath, 'utf8')
  const match = text.match(new RegExp(`^${key}\\s*:\\s*(\\S+)`, 'm'))
  if (!match) return null
  return match[1] === 'true'
}

async function patchHoconBoolean(absPath: string, key: string, value: boolean): Promise<void> {
  const text = await fs.readFile(absPath, 'utf8')
  const pattern = new RegExp(`^(${key}\\s*:\\s*)\\S+`, 'm')
  if (!pattern.test(text)) {
    throw new Error(`No se encontró la clave "${key}" en ${absPath}`)
  }
  await fs.writeFile(absPath, text.replace(pattern, `$1${value}`), 'utf8')
}

export async function installBlueMap(server: ServerConfig): Promise<string> {
  const loader = FLAVOR_TO_LOADER[server.flavor]
  if (!loader) throw new Error(`"${server.flavor}" no soporta BlueMap`)
  const mcVersion = server.installedBuild?.version ?? ''

  // contentManager's own compatibility filtering can't be trusted here: its
  // ignoreCompatibility flag (needed because installedBuild.version is often
  // unset, e.g. for manually-added servers) drops the LOADER filter too, not
  // just the MC-version one — Modrinth's unfiltered version list is sorted
  // by publish date across every loader, so 'latest' can pick an entirely
  // incompatible build (confirmed: it picked a Sponge jar for a Paper
  // server). Loader is never actually ambiguous — it comes straight from
  // server.flavor — so pick the exact version ourselves, always filtering by
  // loader, and hand contentManager that exact versionId instead of 'latest'.
  const allVersions = await getProvider('modrinth').getVersions(BLUEMAP_PROJECT_ID, loader, mcVersion, true)
  const compatible = allVersions.filter((v) => v.loaders.includes(loader))
  const versionMatch = compatible.find((v) => v.gameVersions.includes(mcVersion)) ?? compatible[0]
  if (!versionMatch) throw new Error('No hay una versión de BlueMap compatible con este servidor')

  return contentManager.start(server, 'modrinth', BLUEMAP_PROJECT_ID, 'BlueMap', versionMatch.versionId, true)
}

export async function getMapStatus(server: ServerConfig): Promise<MapStatus> {
  const serverRunning = serverManager.isRunning(server.id)
  try {
    const installed = await contentManager.listInstalled(server)
    const entry = installed.find((e) => e.projectId === BLUEMAP_PROJECT_ID)
    if (!entry) {
      return { phase: 'not-installed', serverRunning, installedVersion: null, error: null }
    }

    const configDir = getConfigDirRel(server)
    const coreConfPath = safeResolve(server.workingDirectory, `${configDir}/core.conf`)
    if (!(await exists(coreConfPath))) {
      return { phase: 'awaiting-first-boot', serverRunning, installedVersion: entry.versionNumber, error: null }
    }

    const webserverConfPath = safeResolve(server.workingDirectory, `${configDir}/webserver.conf`)
    const acceptDownload = await readHoconBoolean(coreConfPath, 'accept-download')
    const webserverEnabled = await readHoconBoolean(webserverConfPath, 'enabled')
    if (acceptDownload !== true || webserverEnabled !== false) {
      return { phase: 'needs-patch', serverRunning, installedVersion: entry.versionNumber, error: null }
    }

    const webIndexPath = safeResolve(server.workingDirectory, WEB_INDEX_REL)
    if (!(await exists(webIndexPath))) {
      return { phase: 'awaiting-first-boot', serverRunning, installedVersion: entry.versionNumber, error: null }
    }

    return { phase: 'ready', serverRunning, installedVersion: entry.versionNumber, error: null }
  } catch (err) {
    return { phase: 'error', serverRunning, installedVersion: null, error: (err as Error).message }
  }
}

export async function activateMap(server: ServerConfig): Promise<void> {
  const configDir = getConfigDirRel(server)
  await patchHoconBoolean(safeResolve(server.workingDirectory, `${configDir}/core.conf`), 'accept-download', true)
  await patchHoconBoolean(safeResolve(server.workingDirectory, `${configDir}/webserver.conf`), 'enabled', false)
  if (serverManager.isRunning(server.id)) {
    serverManager.sendCommand(server.id, '/bluemap reload')
  }
}

/** Deletes the rendered map (web app + tiles) only, not BlueMap's plugin/mod config — so
 * re-activating after a purge is a single server restart, not a full reconfigure. */
export async function purgeMapData(server: ServerConfig): Promise<void> {
  await fs.rm(safeResolve(server.workingDirectory, WEB_DIR_REL), { recursive: true, force: true })
}

export function getMapDiskUsageBytes(server: ServerConfig): Promise<number> {
  return getDirectorySizeBytes(safeResolve(server.workingDirectory, WEB_DIR_REL))
}
