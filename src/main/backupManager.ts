import { promises as fs, createWriteStream } from 'fs'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { ZipArchive } from 'archiver'
import extractZip from 'extract-zip'
import { safeResolve } from './fileManagerCore'
import type { BackupEntry, ServerConfig } from '../shared/types'

interface Manifest {
  backups: BackupEntry[]
}

function backupsDir(serverId: string): string {
  return join(app.getPath('userData'), 'backups', serverId)
}

function manifestPath(serverId: string): string {
  return join(backupsDir(serverId), 'manifest.json')
}

async function readManifest(serverId: string): Promise<Manifest> {
  try {
    const raw = await fs.readFile(manifestPath(serverId), 'utf8')
    return JSON.parse(raw) as Manifest
  } catch {
    return { backups: [] }
  }
}

async function writeManifest(serverId: string, manifest: Manifest): Promise<void> {
  await fs.mkdir(backupsDir(serverId), { recursive: true })
  await fs.writeFile(manifestPath(serverId), JSON.stringify(manifest, null, 2), 'utf8')
}

function timestampForFilename(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

export async function listBackups(serverId: string): Promise<BackupEntry[]> {
  const manifest = await readManifest(serverId)
  const dir = backupsDir(serverId)

  const withSizes = await Promise.all(
    manifest.backups.map(async (b) => {
      try {
        const stat = await fs.stat(join(dir, b.fileName))
        return { ...b, sizeBytes: stat.size }
      } catch {
        return null // backup file was deleted outside the app; drop it
      }
    })
  )
  const alive = withSizes.filter((b): b is BackupEntry => b !== null)
  if (alive.length !== manifest.backups.length) {
    await writeManifest(serverId, { backups: alive })
  }
  return alive.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createBackup(server: ServerConfig): Promise<BackupEntry> {
  const sourceAbs = safeResolve(server.workingDirectory, server.backup.sourcePath)
  const dir = backupsDir(server.id)
  await fs.mkdir(dir, { recursive: true })

  const now = new Date()
  const fileName = `${timestampForFilename(now)}.zip`
  const destAbs = join(dir, fileName)

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(destAbs)
    const archive = new ZipArchive({ zlib: { level: 9 } })
    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err)
    })
    archive.pipe(output)
    archive.directory(sourceAbs, false)
    void archive.finalize()
  })

  const stat = await fs.stat(destAbs)
  const entry: BackupEntry = {
    id: randomUUID(),
    fileName,
    sizeBytes: stat.size,
    createdAt: now.toISOString(),
    sourcePath: server.backup.sourcePath
  }

  const manifest = await readManifest(server.id)
  manifest.backups.push(entry)
  await writeManifest(server.id, manifest)

  return entry
}

export async function restoreBackup(server: ServerConfig, backupId: string): Promise<void> {
  const manifest = await readManifest(server.id)
  const entry = manifest.backups.find((b) => b.id === backupId)
  if (!entry) throw new Error('Backup not found')

  const zipPath = join(backupsDir(server.id), entry.fileName)
  const destAbs = safeResolve(server.workingDirectory, entry.sourcePath)
  await fs.mkdir(destAbs, { recursive: true })
  await extractZip(zipPath, { dir: destAbs })
}

export async function deleteBackup(serverId: string, backupId: string): Promise<void> {
  const manifest = await readManifest(serverId)
  const entry = manifest.backups.find((b) => b.id === backupId)
  if (!entry) return
  await fs.rm(join(backupsDir(serverId), entry.fileName), { force: true })
  await writeManifest(serverId, { backups: manifest.backups.filter((b) => b.id !== backupId) })
}

export async function deleteAllBackupsForServer(serverId: string): Promise<void> {
  await fs.rm(backupsDir(serverId), { recursive: true, force: true })
}

/** Newest backup timestamp for a server, or null if it has none yet. */
export async function latestBackupAt(serverId: string): Promise<Date | null> {
  const backups = await listBackups(serverId)
  if (backups.length === 0) return null
  return new Date(backups[0].createdAt)
}
