import { promises as fs } from 'fs'
import { join, parse as parsePath } from 'path'
import si from 'systeminformation'
import type { DiskUsageInfo } from '../shared/types'

export async function getDirectorySizeBytes(dirAbs: string): Promise<number> {
  let dirents
  try {
    dirents = await fs.readdir(dirAbs, { withFileTypes: true })
  } catch {
    return 0
  }
  const sizes = await Promise.all(
    dirents.map(async (d) => {
      // Never follow symlinks: avoids cycles and double-counting data outside the server folder.
      if (d.isSymbolicLink()) return 0
      const abs = join(dirAbs, d.name)
      if (d.isDirectory()) return getDirectorySizeBytes(abs)
      const stat = await fs.stat(abs).catch(() => null)
      return stat?.size ?? 0
    })
  )
  return sizes.reduce((a, b) => a + b, 0)
}

export async function getDiskUsage(workingDirectory: string): Promise<DiskUsageInfo> {
  const [workingDirectoryBytes, drives] = await Promise.all([
    getDirectorySizeBytes(workingDirectory),
    si.fsSize().catch(() => [])
  ])
  const root = parsePath(workingDirectory).root.replace(/[\\/]+$/, '')
  const drive = drives.find((d) => d.mount.toLowerCase() === root.toLowerCase())
  return {
    workingDirectoryBytes,
    driveTotalBytes: drive?.size ?? null,
    driveFreeBytes: drive?.available ?? null
  }
}
