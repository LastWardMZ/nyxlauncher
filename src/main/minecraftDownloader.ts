import { createWriteStream, promises as fs } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import type {
  BuildChannel,
  DownloadProgress,
  DownloadResult,
  MinecraftBuildOption,
  MinecraftVersionOption,
  ServerFlavor
} from '../shared/types'

// All four projects publish free, unauthenticated JSON APIs — no login, no
// external tool required. Confirmed live against the real endpoints while
// building this (PaperMC moved from api.papermc.io/v2 to fill.papermc.io/v3
// on Dec 31 2025, so this targets the current one).
const FILL_BASE = 'https://fill.papermc.io/v3'
const PURPUR_BASE = 'https://api.purpurmc.org/v2'
const MOJANG_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return (await res.json()) as T
}

function fillProject(flavor: ServerFlavor): string {
  if (flavor === 'paper') return 'paper'
  if (flavor === 'velocity') return 'velocity'
  throw new Error(`${flavor} is not a fill.papermc.io project`)
}

export async function listVersions(flavor: ServerFlavor): Promise<MinecraftVersionOption[]> {
  if (flavor === 'paper' || flavor === 'velocity') {
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

  throw new Error(`No hay descarga integrada para "${flavor}"`)
}

export async function listBuilds(flavor: ServerFlavor, version: string): Promise<MinecraftBuildOption[]> {
  if (flavor === 'paper' || flavor === 'velocity') {
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

  throw new Error(`No hay descarga integrada para "${flavor}"`)
}

async function resolveDownload(
  flavor: ServerFlavor,
  version: string,
  buildId: string
): Promise<{ url: string; fileName: string; javaMajorVersion: number | null }> {
  if (flavor === 'paper' || flavor === 'velocity') {
    const builds = await fetchJson<FillBuild[]>(
      `${FILL_BASE}/projects/${fillProject(flavor)}/versions/${encodeURIComponent(version)}/builds`
    )
    const build = builds.find((b) => String(b.id) === buildId)
    const download = build?.downloads['server:default']
    if (!download) throw new Error(`No se encontró la build ${buildId} para ${version}`)
    return { url: download.url, fileName: download.name, javaMajorVersion: await lookupVanillaJavaVersion(version) }
  }

  if (flavor === 'purpur') {
    const url = `${PURPUR_BASE}/purpur/${encodeURIComponent(version)}/${encodeURIComponent(buildId)}/download`
    return { url, fileName: `purpur-${version}-${buildId}.jar`, javaMajorVersion: await lookupVanillaJavaVersion(version) }
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
      javaMajorVersion: detail.javaVersion?.majorVersion ?? null
    }
  }

  throw new Error(`No hay descarga integrada para "${flavor}"`)
}

/** Vanilla's per-version manifest is the one place Java version requirements are published, and Paper/Purpur build on top of the matching vanilla version. Best-effort — falls back to null if the version string isn't a real vanilla release (e.g. some Paper "major.minor" aliases). */
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

  private async run(jobId: string, flavor: ServerFlavor, version: string, buildId: string, destDir: string): Promise<void> {
    try {
      const { url, fileName, javaMajorVersion } = await resolveDownload(flavor, version, buildId)
      await fs.mkdir(destDir, { recursive: true })
      const destPath = join(destDir, fileName)

      const res = await fetch(url)
      if (!res.ok || !res.body) throw new Error(`Descarga falló: HTTP ${res.status}`)
      const totalBytes = Number(res.headers.get('content-length')) || null

      let downloaded = 0
      const nodeStream = Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream)
      nodeStream.on('data', (chunk: Buffer) => {
        if (this.cancelled.has(jobId)) return
        downloaded += chunk.length
        this.emit('progress', { jobId, downloadedBytes: downloaded, totalBytes } satisfies DownloadProgress)
      })

      if (this.cancelled.has(jobId)) {
        this.cancelled.delete(jobId)
        this.emit('done', {
          jobId,
          success: false,
          error: 'Descarga cancelada',
          destDir,
          executable: '',
          installedBuild: null,
          javaMajorVersion: null
        } satisfies DownloadResult)
        return
      }

      await pipeline(nodeStream, createWriteStream(destPath))

      this.emit('done', {
        jobId,
        success: true,
        error: null,
        destDir,
        executable: destPath,
        installedBuild: { flavor, version, buildId },
        javaMajorVersion
      } satisfies DownloadResult)
    } catch (err) {
      this.emit('done', {
        jobId,
        success: false,
        error: (err as Error).message,
        destDir,
        executable: '',
        installedBuild: null,
        javaMajorVersion: null
      } satisfies DownloadResult)
    }
  }
}

export const minecraftDownloadManager = new MinecraftDownloadManager()

/** Used by the build-update checker: latest build id available for a version, or null if the version has no builds. */
export async function latestBuildId(flavor: ServerFlavor, version: string): Promise<string | null> {
  const builds = await listBuilds(flavor, version)
  return builds[0]?.id ?? null
}
