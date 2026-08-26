import { promises as fs } from 'fs'
import { dialog, type BrowserWindow } from 'electron'
import { basename, join } from 'path'
import { safeResolve } from './fileManagerCore'

export {
  listDirectory,
  readTextFile,
  writeTextFile,
  createFile,
  createDirectory,
  renameEntry,
  deleteEntry
} from './fileManagerCore'

export async function importPaths(
  win: BrowserWindow | null,
  root: string,
  destRelDir: string
): Promise<number> {
  if (!win) return 0
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections']
  })
  if (result.canceled || result.filePaths.length === 0) return 0

  const destAbs = safeResolve(root, destRelDir)
  await fs.mkdir(destAbs, { recursive: true })

  for (const src of result.filePaths) {
    const dest = join(destAbs, basename(src))
    await fs.cp(src, dest, { recursive: true, force: true })
  }
  return result.filePaths.length
}

export async function exportPath(win: BrowserWindow | null, root: string, relPath: string): Promise<boolean> {
  if (!win) return false
  const abs = safeResolve(root, relPath)
  const stat = await fs.stat(abs)

  if (stat.isDirectory()) {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return false
    const dest = join(result.filePaths[0], basename(abs))
    await fs.cp(abs, dest, { recursive: true, force: true })
    return true
  }

  const result = await dialog.showSaveDialog(win, { defaultPath: basename(abs) })
  if (result.canceled || !result.filePath) return false
  await fs.cp(abs, result.filePath, { force: true })
  return true
}
