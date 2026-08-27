import { promises as fs } from 'fs'
import { spawn } from 'child_process'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { downloadFile } from './downloadFile'
import type {
  BuildChannel,
  DownloadProgress,
  DownloadResult,
  LaunchMode,
  MinecraftBuildOption,
  MinecraftVersionOption,
  ServerFlavor
} from '../shared/types'

// Every one of these publishes free, unauthenticated JSON (or plain Maven/Jenkins)
// endpoints — no login, no external tool required. Confirmed live against the
// real endpoints while building this (PaperMC moved from api.papermc.io/v2 to
// fill.papermc.io/v3 on Dec 31 2025, so this targets the current one).
const FILL_BASE = 'https://fill.papermc.io/v3'
const PURPUR_BASE = 'https://api.purpurmc.org/v2'
const MOJANG_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const FABRIC_META_BASE = 'https://meta.fabricmc.net/v2'
const FORGE_MAVEN_METADATA_URL = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'
const FORGE_MAVEN_BASE = 'https://maven.minecraftforge.net/net/minecraftforge/forge'
const NEOFORGE_VERSIONS_URL = 'https://maven.neoforged.net/api/maven/versions/releases/net%2Fneoforged%2Fneoforge'
const NEOFORGE_MAVEN_BASE = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'
// ci.md-5.net just redirects here; hitting the real host directly avoids the extra hop.
const BUNGEECORD_JENKINS_BASE = 'https://hub.spigotmc.org/jenkins/job/BungeeCord'

interface FillProjectResponse {
  versions: Record<string, string[]>
}

interface FillBuild {
  id: number
  time: string
  channel: string
  downloads: Record<string, { name: string; url: string; size: number }>
}

interface PurpurProjectResponse {
  versions: string[]
}

interface PurpurVersionResponse {
  builds: { latest: string; all: string[] }
}

interface MojangManifest {
  versions: { id: string; type: string; url: string }[]
}

interface MojangVersionDetail {
  javaVersion?: { majorVersion: number }
  downloads: { server?: { url: string; size: number; sha1: string } }
}

interface FabricGameVersion {
  version: string
  stable: boolean
}

interface FabricLoaderVersion {
  version: string
  stable: boolean
}

interface FabricInstallerVersion {
  version: string
  stable: boolean
}

interface NeoforgeVersionsResponse {
  versions: string[]
}

interface JenkinsBuildsResponse {
  builds: { number: number }[]
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return (await res.json()) as T
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.text()
}

function fillProject(flavor: ServerFlavor): string {
  if (flavor === 'paper' || flavor === 'velocity' || flavor === 'folia') return flavor
  throw new Error(`${flavor} is not a fill.papermc.io project`)
}

/** Latest stable (or just latest) Fabric installer version — resolved fresh at download time. */
async function latestFabricInstaller(): Promise<string> {
  const installers = await fetchJson<FabricInstallerVersion[]>(`${FABRIC_META_BASE}/versions/installer`)
  return (installers.find((i) => i.stable) ?? installers[0]).version
}

export async function listVersions(flavor: ServerFlavor): Promise<MinecraftVersionOption[]> {
  if (flavor === 'paper' || flavor === 'velocity' || flavor === 'folia') {
    const data = await fetchJson<FillProjectResponse>(`${FILL_BASE}/projects/${fillProject(flavor)}`)
    const options: MinecraftVersionOption[] = []
    for (const [group, versions] of Object.entries(data.versions)) {
      for (const id of versions) options.push({ id, group })
    }
    return options
  }

  if (flavor === 'purpur') {
    const data = await fetchJson<PurpurProjectResponse>(`${PURPUR_BASE}/purpur`)
    return [...data.versions].reverse().map((id) => ({ id, group: id.split('.').slice(0, 2).join('.') }))
  }

  if (flavor === 'vanilla') {
    const data = await fetchJson<MojangManifest>(MOJANG_MANIFEST_URL)
    return data.versions.map((v) => ({ id: v.id, group: v.type }))
  }

  if (flavor === 'fabric') {
    const games = await fetchJson<FabricGameVersion[]>(`${FABRIC_META_BASE}/versions/game`)
    return games.map((g) => ({ id: g.version, group: g.stable ? 'release' : 'snapshot' }))
  }

  if (flavor === 'forge') {
    // Maven metadata has no per-version detail endpoint — every combined
    // "{mcVersion}-{forgeVersion}" string lives in one flat, newest-first list.
    const xml = await fetchText(FORGE_MAVEN_METADATA_URL)
    const ids = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
    const seen = new Set<string>()
    const options: MinecraftVersionOption[] = []
    for (const id of ids) {
      const mcVersion = id.split('-')[0]
      if (seen.has(mcVersion)) continue
      seen.add(mcVersion)
      options.push({ id: mcVersion, group: mcVersion.split('.').slice(0, 2).join('.') })
    }
    return options
  }

  if (flavor === 'neoforge') {
    const data = await fetchJson<NeoforgeVersionsResponse>(NEOFORGE_VERSIONS_URL)
    const seen = new Set<string>()
    const options: MinecraftVersionOption[] = []
    for (const v of [...data.versions].reverse()) {
      const group = v.split('.').slice(0, 2).join('.')
      if (seen.has(group)) continue
      seen.add(group)
      options.push({ id: group, group })
    }
    return options
  }

  if (flavor === 'bungeecord') {
    // BungeeCord is one continuously-built proxy, not versioned per Minecraft
    // release — "version" here is a placeholder; real picking happens on build.
    return [{ id: 'latest', group: 'BungeeCord' }]
  }

  throw new Error(`No hay descarga integrada para "${flavor}"`)
}

export async function listBuilds(flavor: ServerFlavor, version: string): Promise<MinecraftBuildOption[]> {
  if (flavor === 'paper' || flavor === 'velocity' || flavor === 'folia') {
    const builds = await fetchJson<FillBuild[]>(
      `${FILL_BASE}/projects/${fillProject(flavor)}/versions/${encodeURIComponent(version)}/builds`
    )
    return builds.map((b) => ({
      id: String(b.id),
      channel: (['STABLE', 'BETA', 'ALPHA', 'RECOMMENDED'].includes(b.channel) ? b.channel : 'UNKNOWN') as BuildChannel,
      time: b.time
    }))
  }

  if (flavor === 'purpur') {
    const data = await fetchJson<PurpurVersionResponse>(`${PURPUR_BASE}/purpur/${encodeURIComponent(version)}`)
    return [...data.builds.all]
      .reverse()
      .map((id) => ({ id, channel: id === data.builds.latest ? 'STABLE' : 'UNKNOWN', time: null }) as MinecraftBuildOption)
  }

  if (flavor === 'vanilla') {
    // Vanilla has exactly one "build" per version.
    return [{ id: version, channel: 'STABLE', time: null }]
  }

  if (flavor === 'fabric') {
    // "Build" here is really the loader version — Fabric splits game/loader/
    // installer independently, and the installer is auto-resolved at download time.
    const loaders = await fetchJson<FabricLoaderVersion[]>(`${FABRIC_META_BASE}/versions/loader`)
    return loaders.map((l) => ({ id: l.version, channel: l.stable ? 'STABLE' : 'UNKNOWN', time: null }))
  }

  if (flavor === 'forge') {
    const xml = await fetchText(FORGE_MAVEN_METADATA_URL)
    const ids = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
    return ids
      .filter((id) => id.split('-')[0] === version)
      .map((id, i) => ({ id, channel: (i === 0 ? 'STABLE' : 'UNKNOWN') as BuildChannel, time: null }))
  }

  if (flavor === 'neoforge') {
    const data = await fetchJson<NeoforgeVersionsResponse>(NEOFORGE_VERSIONS_URL)
    return [...data.versions]
      .reverse()
      .filter((v) => v.split('.').slice(0, 2).join('.') === version)
      .map((id, i) => ({ id, channel: (i === 0 ? 'STABLE' : 'UNKNOWN') as BuildChannel, time: null }))
  }

  if (flavor === 'bungeecord') {
    const data = await fetchJson<JenkinsBuildsResponse>(`${BUNGEECORD_JENKINS_BASE}/api/json`)
    return data.builds
      .slice(0, 15)
      .map((b, i) => ({ id: String(b.number), channel: (i === 0 ? 'STABLE' : 'UNKNOWN') as BuildChannel, time: null }))
  }

  throw new Error(`No hay descarga integrada para "${flavor}"`)
}

interface ResolvedDownload {
  url: string
  fileName: string
  javaMajorVersion: number | null
  launchMode: LaunchMode
  /** Forge/NeoForge ship an installer, not a runnable jar — it has to be executed once after download. */
  postInstall: 'none' | 'forge-installer'
}

async function resolveDownload(flavor: ServerFlavor, version: string, buildId: string): Promise<ResolvedDownload> {
  if (flavor === 'paper' || flavor === 'velocity' || flavor === 'folia') {
    const builds = await fetchJson<FillBuild[]>(
      `${FILL_BASE}/projects/${fillProject(flavor)}/versions/${encodeURIComponent(version)}/builds`
    )
    const build = builds.find((b) => String(b.id) === buildId)
    const download = build?.downloads['server:default']
    if (!download) throw new Error(`No se encontró la build ${buildId} para ${version}`)
    return {
      url: download.url,
      fileName: download.name,
      javaMajorVersion: await lookupVanillaJavaVersion(version),
      launchMode: 'jar',
      postInstall: 'none'
    }
  }

  if (flavor === 'purpur') {
    const url = `${PURPUR_BASE}/purpur/${encodeURIComponent(version)}/${encodeURIComponent(buildId)}/download`
    return {
      url,
      fileName: `purpur-${version}-${buildId}.jar`,
      javaMajorVersion: await lookupVanillaJavaVersion(version),
      launchMode: 'jar',
      postInstall: 'none'
    }
  }

  if (flavor === 'vanilla') {
    const manifest = await fetchJson<MojangManifest>(MOJANG_MANIFEST_URL)
    const entry = manifest.versions.find((v) => v.id === version)
    if (!entry) throw new Error(`Versión vanilla "${version}" no encontrada`)
    const detail = await fetchJson<MojangVersionDetail>(entry.url)
    if (!detail.downloads.server) throw new Error(`La versión ${version} no tiene servidor descargable`)
    return {
      url: detail.downloads.server.url,
      fileName: 'server.jar',
      javaMajorVersion: detail.javaVersion?.majorVersion ?? null,
      launchMode: 'jar',
      postInstall: 'none'
    }
  }

  if (flavor === 'fabric') {
    const installerVersion = await latestFabricInstaller()
    const url = `${FABRIC_META_BASE}/versions/loader/${encodeURIComponent(version)}/${encodeURIComponent(buildId)}/${encodeURIComponent(installerVersion)}/server/jar`
    return {
      url,
      fileName: `fabric-server-${version}-${buildId}.jar`,
      javaMajorVersion: await lookupVanillaJavaVersion(version),
      launchMode: 'jar',
      postInstall: 'none'
    }
  }

  if (flavor === 'forge') {
    const url = `${FORGE_MAVEN_BASE}/${buildId}/forge-${buildId}-installer.jar`
    return {
      url,
      fileName: `forge-${buildId}-installer.jar`,
      javaMajorVersion: await lookupVanillaJavaVersion(version),
      launchMode: 'command',
      postInstall: 'forge-installer'
    }
  }

  if (flavor === 'neoforge') {
    const url = `${NEOFORGE_MAVEN_BASE}/${buildId}/neoforge-${buildId}-installer.jar`
    return {
      url,
      fileName: `neoforge-${buildId}-installer.jar`,
      javaMajorVersion: null,
      launchMode: 'command',
      postInstall: 'forge-installer'
    }
  }

  if (flavor === 'bungeecord') {
    const url = `${BUNGEECORD_JENKINS_BASE}/${buildId}/artifact/bootstrap/target/BungeeCord.jar`
    return {
      url,
      fileName: `BungeeCord-${buildId}.jar`,
      javaMajorVersion: null,
      launchMode: 'jar',
      postInstall: 'none'
    }
  }

  throw new Error(`No hay descarga integrada para "${flavor}"`)
}

/** Vanilla's per-version manifest is the one place Java version requirements are published, and Paper/Purpur/Fabric build on top of the matching vanilla version. Best-effort — falls back to null if the version string isn't a real vanilla release (e.g. some Paper "major.minor" aliases). */
async function lookupVanillaJavaVersion(version: string): Promise<number | null> {
  try {
    const manifest = await fetchJson<MojangManifest>(MOJANG_MANIFEST_URL)
    const entry = manifest.versions.find((v) => v.id === version)
    if (!entry) return null
    const detail = await fetchJson<MojangVersionDetail>(entry.url)
    return detail.javaVersion?.majorVersion ?? null
  } catch {
    return null
  }
}

/** Runs `java -jar <installer> --installServer` in destDir — the documented headless install mode for both Forge and NeoForge installers. Produces run.bat/run.sh plus a libraries/ folder; nothing here reads that layout directly, the resulting run script is just handed to serverManager as a "command" launch. */
function runForgeInstaller(destDir: string, installerFileName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('java', ['-jar', installerFileName, '--installServer'], {
      cwd: destDir,
      windowsHide: true
    })
    let tail = ''
    proc.stdout?.on('data', (c: Buffer) => {
      tail = (tail + c.toString('utf8')).slice(-2000)
    })
    proc.stderr?.on('data', (c: Buffer) => {
      tail = (tail + c.toString('utf8')).slice(-2000)
    })
    proc.on('error', reject)
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`El instalador terminó con código ${code}${tail ? `: ${tail.trim().slice(-300)}` : ''}`))
    })
  })
}

class MinecraftDownloadManager extends EventEmitter {
  private cancelled = new Set<string>()

  async start(flavor: ServerFlavor, version: string, buildId: string, destDir: string): Promise<string> {
    const jobId = randomUUID()
    void this.run(jobId, flavor, version, buildId, destDir)
    return jobId
  }

  cancel(jobId: string): void {
    this.cancelled.add(jobId)
  }

  private failed(jobId: string, destDir: string, error: string): DownloadResult {
    return {
      jobId,
      success: false,
      error,
      destDir,
      executable: '',
      launchMode: 'jar',
      installedBuild: null,
      javaMajorVersion: null
    }
  }

  private async run(jobId: string, flavor: ServerFlavor, version: string, buildId: string, destDir: string): Promise<void> {
    try {
      const { url, fileName, javaMajorVersion, launchMode, postInstall } = await resolveDownload(flavor, version, buildId)
      await fs.mkdir(destDir, { recursive: true })
      const destPath = join(destDir, fileName)

      if (this.cancelled.has(jobId)) {
        this.cancelled.delete(jobId)
        this.emit('done', this.failed(jobId, destDir, 'Descarga cancelada') satisfies DownloadResult)
        return
      }

      await downloadFile(url, destPath, (downloadedBytes, totalBytes) => {
        this.emit('progress', { jobId, downloadedBytes, totalBytes } satisfies DownloadProgress)
      })

      if (this.cancelled.has(jobId)) {
        this.cancelled.delete(jobId)
        await fs.rm(destPath, { force: true })
        this.emit('done', this.failed(jobId, destDir, 'Descarga cancelada') satisfies DownloadResult)
        return
      }

      let executable = destPath
      let finalLaunchMode = launchMode
      if (postInstall === 'forge-installer') {
        await runForgeInstaller(destDir, fileName)
        executable = join(destDir, 'run.bat')
        finalLaunchMode = 'command'
      }

      this.emit('done', {
        jobId,
        success: true,
        error: null,
        destDir,
        executable,
        launchMode: finalLaunchMode,
        installedBuild: { flavor, version, buildId },
        javaMajorVersion
      } satisfies DownloadResult)
    } catch (err) {
      this.emit('done', this.failed(jobId, destDir, (err as Error).message) satisfies DownloadResult)
    }
  }
}

export const minecraftDownloadManager = new MinecraftDownloadManager()

/** Used by the build-update checker: latest build id available for a version, or null if the version has no builds. */
export async function latestBuildId(flavor: ServerFlavor, version: string): Promise<string | null> {
  const builds = await listBuilds(flavor, version)
  return builds[0]?.id ?? null
}
