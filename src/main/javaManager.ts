import { promises as fs } from 'fs'
import { join } from 'path'
import extractZip from 'extract-zip'
import { platform } from './platform/platform'
import { downloadFile } from './downloadFile'
import type { JavaManagedInstall } from '../shared/types'

// Covers every Java major version a Minecraft server has actually required
// historically (8 for old versions, 16/17 for the Paper/1.17+ era, 21 for
// current versions) — matches lookupVanillaJavaVersion()'s possible outputs
// in minecraftDownloader.ts closely enough to be useful without offering an
// unbounded, confusing list.
const MANAGED_VERSIONS = [8, 16, 17, 21] as const

interface AdoptiumAsset {
  binary: { package: { link: string; name: string } }
}

function javaRootDir(): string {
  return join(platform.getDataDir(), 'java')
}

function versionDir(majorVersion: number): string {
  return join(javaRootDir(), String(majorVersion))
}

async function findJavaExe(dir: string, depth = 0): Promise<string | null> {
  if (depth > 4) return null // Adoptium zips nest one "jdk-17.0.9+9-jre" folder deep — a few levels of headroom is plenty
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === 'java.exe') return full
    if (entry.isDirectory()) {
      const found = await findJavaExe(full, depth + 1)
      if (found) return found
    }
  }
  return null
}

export function managedVersions(): readonly number[] {
  return MANAGED_VERSIONS
}

export async function listManagedJava(): Promise<JavaManagedInstall[]> {
  return Promise.all(
    MANAGED_VERSIONS.map(async (majorVersion) => {
      const javaPath = await findJavaExe(versionDir(majorVersion))
      return { majorVersion, installed: javaPath !== null, javaPath }
    })
  )
}

export async function installJava(
  majorVersion: number,
  onProgress?: (downloadedBytes: number, totalBytes: number | null) => void
): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error('La gestión de Java integrada solo está disponible en el instalador de Windows — Docker ya trae su propio JDK en la imagen.')
  }
  if (!MANAGED_VERSIONS.includes(majorVersion as (typeof MANAGED_VERSIONS)[number])) {
    throw new Error(`Java ${majorVersion} no está entre las versiones gestionadas`)
  }

  const url = `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se encontró una build de Java ${majorVersion} (HTTP ${res.status})`)
  const assets = (await res.json()) as AdoptiumAsset[]
  const asset = assets[0]
  if (!asset) throw new Error(`No se encontró una build de Java ${majorVersion} para Windows x64`)

  const dir = versionDir(majorVersion)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(javaRootDir(), { recursive: true })
  const zipPath = join(javaRootDir(), `java-${majorVersion}-download.zip`)

  try {
    await downloadFile(asset.binary.package.link, zipPath, onProgress)
    await extractZip(zipPath, { dir })
  } finally {
    await fs.rm(zipPath, { force: true })
  }

  const exe = await findJavaExe(dir)
  if (!exe) {
    await fs.rm(dir, { recursive: true, force: true })
    throw new Error('La descarga se completó pero no se encontró java.exe dentro del paquete.')
  }
  return exe
}

export async function removeJava(majorVersion: number): Promise<void> {
  await fs.rm(versionDir(majorVersion), { recursive: true, force: true })
}
