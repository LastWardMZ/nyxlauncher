import { promises as fs, createReadStream } from 'fs'
import { createHash, randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { join } from 'path'
import extractZip from 'extract-zip'
import { downloadFile } from '../downloadFile'
import { safeResolve } from '../fileManagerCore'
import { getProvider } from './providers'
import type {
  ContentInstallProgress,
  ContentInstallResult,
  ContentProjectType,
  ContentProvider,
  ContentVersion,
  InstalledContentEntry,
  ServerConfig
} from '../../shared/types'
import { FLAVOR_CONTENT_TYPE, FLAVOR_TO_LOADER } from '../../shared/types'

const MANIFEST_NAME = 'installed_content.json'

function manifestPath(server: ServerConfig): string {
  return join(server.workingDirectory, MANIFEST_NAME)
}

async function readManifest(server: ServerConfig): Promise<InstalledContentEntry[]> {
  try {
    const raw = await fs.readFile(manifestPath(server), 'utf8')
    return JSON.parse(raw) as InstalledContentEntry[]
  } catch {
    return []
  }
}

async function writeManifest(server: ServerConfig, entries: InstalledContentEntry[]): Promise<void> {
  await fs.writeFile(manifestPath(server), JSON.stringify(entries, null, 2), 'utf8')
}

/** 'plugins' or 'mods', or throws for flavors with no content support (vanilla/other). */
export function contentDirName(server: ServerConfig): string {
  const type = FLAVOR_CONTENT_TYPE[server.flavor]
  if (!type) throw new Error(`"${server.flavor}" no tiene contenido instalable`)
  return type === 'plugin' ? 'plugins' : 'mods'
}

export function contentProjectType(server: ServerConfig): ContentProjectType {
  const type = FLAVOR_CONTENT_TYPE[server.flavor]
  if (!type) throw new Error(`"${server.flavor}" no tiene contenido instalable`)
  return type
}

export function loaderFor(server: ServerConfig): string {
  const loader = FLAVOR_TO_LOADER[server.flavor]
  if (!loader) throw new Error(`"${server.flavor}" no tiene contenido instalable`)
  return loader
}

function sha1File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function pickVersion(
  providerId: ContentProvider,
  projectId: string,
  loader: string,
  mcVersion: string,
  versionId: string | 'latest',
  ignoreCompatibility: boolean
): Promise<ContentVersion> {
  const versions = await getProvider(providerId).getVersions(projectId, loader, mcVersion, ignoreCompatibility)
  if (versions.length === 0) throw new Error('No hay versiones compatibles para este servidor')
  if (versionId === 'latest') return versions[0]
  const found = versions.find((v) => v.versionId === versionId)
  if (!found) throw new Error('La versión seleccionada ya no está disponible')
  return found
}

class ContentManager extends EventEmitter {
  async start(
    server: ServerConfig,
    providerId: ContentProvider,
    projectId: string,
    title: string,
    versionId: string | 'latest',
    ignoreCompatibility = false
  ): Promise<string> {
    const jobId = randomUUID()
    void this.run(jobId, server, providerId, projectId, title, versionId, ignoreCompatibility)
    return jobId
  }

  private async run(
    jobId: string,
    server: ServerConfig,
    providerId: ContentProvider,
    projectId: string,
    title: string,
    versionId: string | 'latest',
    ignoreCompatibility: boolean
  ): Promise<void> {
    try {
      const installed = await this.installOne(server, providerId, projectId, title, versionId, ignoreCompatibility, jobId)
      this.emit('done', { jobId, success: true, error: null, installed } satisfies ContentInstallResult)
    } catch (err) {
      this.emit('done', {
        jobId,
        success: false,
        error: (err as Error).message,
        installed: []
      } satisfies ContentInstallResult)
    }
  }

  /** Installs one project plus any required dependencies not already present. Used both for the top-level install and recursively — dependencies don't get their own job/progress events, just the top one. */
  private async installOne(
    server: ServerConfig,
    providerId: ContentProvider,
    projectId: string,
    title: string,
    versionId: string | 'latest',
    ignoreCompatibility: boolean,
    jobId: string,
    isDependency = false
  ): Promise<InstalledContentEntry[]> {
    const loader = loaderFor(server)
    const mcVersion = server.installedBuild?.version ?? ''
    const projectType = contentProjectType(server)
    const dirName = contentDirName(server)

    const existing = await readManifest(server)
    if (existing.some((e) => e.projectId === projectId)) return []

    const version = await pickVersion(providerId, projectId, loader, mcVersion, versionId, ignoreCompatibility)
    const dir = safeResolve(server.workingDirectory, dirName)
    await fs.mkdir(dir, { recursive: true })
    const destPath = join(dir, version.fileName)

    const attemptDownload = async (): Promise<void> => {
      await downloadFile(version.url, destPath, (downloadedBytes, totalBytes) => {
        this.emit('progress', { jobId, projectId, title, downloadedBytes, totalBytes } satisfies ContentInstallProgress)
      })
    }

    await attemptDownload()
    let actualSha1 = await sha1File(destPath)
    if (actualSha1 !== version.sha1) {
      // Retry once — spec calls for exactly one retry on hash mismatch before giving up.
      await attemptDownload()
      actualSha1 = await sha1File(destPath)
      if (actualSha1 !== version.sha1) {
        await fs.rm(destPath, { force: true })
        throw new Error(`El archivo descargado de "${title}" no coincide con el hash esperado`)
      }
    }

    const entry: InstalledContentEntry = {
      projectId,
      projectType,
      provider: providerId,
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      fileName: version.fileName,
      sha1: actualSha1,
      installedAt: new Date().toISOString(),
      loader,
      mcVersion,
      title,
      iconUrl: null,
      isDependency
    }

    const all = [...existing, entry]
    let installedEntries = [entry]

    const requiredDeps = version.dependencies.filter((d) => d.dependencyType === 'required' && d.projectId)
    for (const dep of requiredDeps) {
      if (all.some((e) => e.projectId === dep.projectId)) continue
      try {
        const depEntries = await this.installOne(server, providerId, dep.projectId as string, dep.projectId as string, 'latest', ignoreCompatibility, jobId, true)
        installedEntries = [...installedEntries, ...depEntries]
        all.push(...depEntries)
      } catch {
        // A missing/incompatible dependency shouldn't block installing the thing the user
        // actually asked for — they'll see it's not in the installed list and can search it manually.
      }
    }

    await writeManifest(server, all)
    return installedEntries
  }

  async update(server: ServerConfig, providerId: ContentProvider, projectId: string): Promise<InstalledContentEntry | null> {
    const entries = await readManifest(server)
    const current = entries.find((e) => e.projectId === projectId)
    if (!current) throw new Error('Este contenido no está instalado')

    const loader = loaderFor(server)
    const mcVersion = server.installedBuild?.version ?? ''
    const versions = await getProvider(providerId).getVersions(projectId, loader, mcVersion)
    const latest = versions[0]
    if (!latest || latest.versionId === current.versionId) return null

    const dir = safeResolve(server.workingDirectory, contentDirName(server))
    await fs.rm(join(dir, current.fileName), { force: true })
    const destPath = join(dir, latest.fileName)
    await downloadFile(latest.url, destPath)
    const actualSha1 = await sha1File(destPath)
    if (actualSha1 !== latest.sha1) {
      await fs.rm(destPath, { force: true })
      throw new Error(`El archivo actualizado de "${current.title}" no coincide con el hash esperado`)
    }

    const updated: InstalledContentEntry = {
      ...current,
      versionId: latest.versionId,
      versionNumber: latest.versionNumber,
      fileName: latest.fileName,
      sha1: actualSha1,
      installedAt: new Date().toISOString()
    }
    await writeManifest(server, entries.map((e) => (e.projectId === projectId ? updated : e)))
    return updated
  }

  async uninstall(server: ServerConfig, projectId: string): Promise<void> {
    const entries = await readManifest(server)
    const entry = entries.find((e) => e.projectId === projectId)
    if (!entry) return
    const dir = safeResolve(server.workingDirectory, contentDirName(server))
    await fs.rm(join(dir, entry.fileName), { force: true })
    await writeManifest(server, entries.filter((e) => e.projectId !== projectId))
  }

  listInstalled(server: ServerConfig): Promise<InstalledContentEntry[]> {
    return readManifest(server)
  }

  /** Same flow as installModpack(), but the .mrpack comes from a provider (Modrinth modpack search) instead of a file the user picked. */
  async startModpackInstall(
    server: ServerConfig,
    providerId: ContentProvider,
    projectId: string,
    title: string,
    versionId: string | 'latest',
    ignoreCompatibility = false
  ): Promise<string> {
    const jobId = randomUUID()
    void this.runModpackInstall(jobId, server, providerId, projectId, title, versionId, ignoreCompatibility)
    return jobId
  }

  private async runModpackInstall(
    jobId: string,
    server: ServerConfig,
    providerId: ContentProvider,
    projectId: string,
    title: string,
    versionId: string | 'latest',
    ignoreCompatibility: boolean
  ): Promise<void> {
    const tempPath = join(server.workingDirectory, `.mrpack-download-${jobId}`)
    try {
      const loader = loaderFor(server)
      const mcVersion = server.installedBuild?.version ?? ''
      const version = await pickVersion(providerId, projectId, loader, mcVersion, versionId, ignoreCompatibility)

      await fs.mkdir(server.workingDirectory, { recursive: true })
      this.emit('progress', { jobId, projectId, title, downloadedBytes: 0, totalBytes: null } satisfies ContentInstallProgress)
      await downloadFile(version.url, tempPath, (downloadedBytes, totalBytes) => {
        this.emit('progress', { jobId, projectId, title, downloadedBytes, totalBytes } satisfies ContentInstallProgress)
      })
      const actualSha1 = await sha1File(tempPath)
      if (actualSha1 !== version.sha1) {
        throw new Error(`El modpack "${title}" descargado no coincide con el hash esperado`)
      }

      const result = await this.installModpack(server, tempPath)
      this.emit('done', { jobId, success: result.success, error: result.error, installed: result.installed } satisfies ContentInstallResult)
    } catch (err) {
      this.emit('done', { jobId, success: false, error: (err as Error).message, installed: [] } satisfies ContentInstallResult)
    } finally {
      await fs.rm(tempPath, { force: true })
    }
  }

  async installModpack(server: ServerConfig, mrpackPath: string): Promise<ContentInstallResult> {
    const jobId = randomUUID()
    const loader = loaderFor(server)
    const mcVersion = server.installedBuild?.version ?? ''

    const extractDir = join(server.workingDirectory, `.mrpack-${jobId}`)
    await extractZip(mrpackPath, { dir: extractDir })

    try {
      const indexRaw = await fs.readFile(join(extractDir, 'modrinth.index.json'), 'utf8')
      const index = JSON.parse(indexRaw) as {
        files: { path: string; downloads: string[]; hashes: { sha1: string }; env?: { server?: string } }[]
        dependencies: Record<string, string>
      }

      const requiredLoaderKey = Object.keys(index.dependencies).find((k) => k !== 'minecraft')
      const requiredMcVersion = index.dependencies.minecraft
      if (requiredMcVersion && mcVersion && requiredMcVersion !== mcVersion) {
        throw new Error(
          `Este modpack necesita Minecraft ${requiredMcVersion}, pero el servidor está en ${mcVersion}. Crea un servidor con esa versión primero.`
        )
      }
      if (requiredLoaderKey && !requiredLoaderKey.startsWith(loader)) {
        throw new Error(`Este modpack necesita el loader "${requiredLoaderKey}", pero este servidor usa "${loader}".`)
      }

      const installed: InstalledContentEntry[] = []
      for (const file of index.files) {
        if (file.env?.server === 'unsupported') continue
        const url = file.downloads[0]
        if (!url) continue
        const relDir = file.path.split('/').slice(0, -1).join('/')
        const fileName = file.path.split('/').pop() as string
        const dir = safeResolve(server.workingDirectory, relDir)
        await fs.mkdir(dir, { recursive: true })
        const destPath = join(dir, fileName)
        this.emit('progress', { jobId, projectId: fileName, title: fileName, downloadedBytes: 0, totalBytes: null } satisfies ContentInstallProgress)
        await downloadFile(url, destPath)
        installed.push({
          projectId: fileName,
          projectType: contentProjectType(server),
          provider: 'modrinth',
          versionId: file.hashes.sha1,
          versionNumber: index.dependencies.minecraft ?? '',
          fileName,
          sha1: file.hashes.sha1,
          installedAt: new Date().toISOString(),
          loader,
          mcVersion,
          title: fileName,
          iconUrl: null,
          isDependency: false
        })
      }

      // overrides/ always applies; server-overrides/ takes precedence for us specifically.
      for (const overridesDir of ['overrides', 'server-overrides']) {
        const src = join(extractDir, overridesDir)
        if (
          await fs
            .access(src)
            .then(() => true)
            .catch(() => false)
        ) {
          await fs.cp(src, server.workingDirectory, { recursive: true, force: true })
        }
      }

      const existing = await readManifest(server)
      await writeManifest(server, [...existing.filter((e) => !installed.some((i) => i.projectId === e.projectId)), ...installed])

      return { jobId, success: true, error: null, installed }
    } finally {
      await fs.rm(extractDir, { recursive: true, force: true })
    }
  }
}

export const contentManager = new ContentManager()
