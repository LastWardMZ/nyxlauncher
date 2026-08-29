import { promises as fs } from 'fs'
import { basename, join } from 'path'
import { safeResolve } from './fileManagerCore'
import { platform, type WindowHandle } from './platform/platform'

export {
  listDirectory,
  readTextFile,
  writeTextFile,
  writeBinaryFile,
  createFile,
  createDirectory,
  renameEntry,
  deleteEntry
} from './fileManagerCore'

export async function importPaths(win: WindowHandle, root: string, destRelDir: string): Promise<number> {
  const srcPaths = await platform.pickFilesToImport(win)
  if (srcPaths.length === 0) return 0

  const destAbs = safeResolve(root, destRelDir)
  await fs.mkdir(destAbs, { recursive: true })

  for (const src of srcPaths) {
    const dest = join(destAbs, basename(src))
    await fs.cp(src, dest, { recursive: true, force: true })
  }
  return srcPaths.length
}

export async function exportPath(win: WindowHandle, root: string, relPath: string): Promise<boolean> {
  const abs = safeResolve(root, relPath)
  const stat = await fs.stat(abs)

  if (stat.isDirectory()) {
    const destDir = await platform.pickDirectory(win)
    if (!destDir) return false
    const dest = join(destDir, basename(abs))
    await fs.cp(abs, dest, { recursive: true, force: true })
    return true
  }

  const destFile = await platform.pickSaveFile(win, basename(abs))
  if (!destFile) return false
  await fs.cp(abs, destFile, { force: true })
  return true
}
