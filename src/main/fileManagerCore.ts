import { promises as fs } from 'fs'
import { join, relative, resolve as resolvePath } from 'path'
import type { FileEntry, ReadTextFileResult } from '../shared/types'

const MAX_TEXT_FILE_BYTES = 4 * 1024 * 1024 // 4MB — generous for config/whitelist/log files, guards against opening huge binaries

/**
 * Resolves a renderer-supplied relative path against a server's working
 * directory and refuses anything that would escape it (e.g. "../../etc"),
 * since the file manager is only ever supposed to touch that one folder.
 */
export function safeResolve(root: string, relPath: string): string {
  const rootResolved = resolvePath(root)
  const target = resolvePath(rootResolved, relPath || '.')
  const rel = relative(rootResolved, target)
  if (rel.startsWith('..') || (rel !== '' && resolvePath(rootResolved, rel) !== target)) {
    throw new Error(`Path "${relPath}" escapes the server directory`)
  }
  return target
}

function toRelPath(root: string, absPath: string): string {
  return relative(resolvePath(root), absPath).split('\\').join('/')
}

export async function listDirectory(root: string, relDir: string): Promise<FileEntry[]> {
  const dirAbs = safeResolve(root, relDir)
  let dirents
  try {
    dirents = await fs.readdir(dirAbs, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }

  const entries = await Promise.all(
    dirents.map(async (d) => {
      const abs = join(dirAbs, d.name)
      const stat = await fs.stat(abs).catch(() => null)
      return {
        name: d.name,
        relPath: toRelPath(root, abs),
        isDirectory: d.isDirectory(),
        size: stat?.size ?? 0,
        modifiedAt: stat?.mtime?.toISOString() ?? new Date().toISOString()
      } satisfies FileEntry
    })
  )

  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

export async function readTextFile(root: string, relPath: string): Promise<ReadTextFileResult | null> {
  const abs = safeResolve(root, relPath)
  let stat
  try {
    stat = await fs.stat(abs)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  if (stat.isDirectory()) throw new Error('Cannot read a directory as text')

  const truncated = stat.size > MAX_TEXT_FILE_BYTES
  if (!truncated) {
    return { content: await fs.readFile(abs, 'utf8'), truncated: false }
  }
  const handle = await fs.open(abs, 'r')
  try {
    const buffer = Buffer.alloc(MAX_TEXT_FILE_BYTES)
    await handle.read(buffer, 0, MAX_TEXT_FILE_BYTES, 0)
    return { content: buffer.toString('utf8'), truncated: true }
  } finally {
    await handle.close()
  }
}

export async function writeTextFile(root: string, relPath: string, content: string): Promise<void> {
  const abs = safeResolve(root, relPath)
  await fs.mkdir(resolvePath(abs, '..'), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
}

/** Drag-and-drop / browser-picker uploads hand over raw file bytes (never a
 *  host filesystem path — the dropped file lives on whatever device the
 *  browser is running on, which for the remote panel/Docker is never the
 *  same machine as the server), so this is the one write path that takes a
 *  base64 payload instead of a source path to copy from. */
export async function writeBinaryFile(root: string, relPath: string, base64Content: string): Promise<void> {
  const abs = safeResolve(root, relPath)
  await fs.mkdir(resolvePath(abs, '..'), { recursive: true })
  await fs.writeFile(abs, Buffer.from(base64Content, 'base64'))
}

export async function createFile(root: string, relPath: string): Promise<void> {
  const abs = safeResolve(root, relPath)
  await fs.mkdir(resolvePath(abs, '..'), { recursive: true })
  await fs.writeFile(abs, '', { flag: 'wx' })
}

export async function createDirectory(root: string, relPath: string): Promise<void> {
  const abs = safeResolve(root, relPath)
  await fs.mkdir(abs, { recursive: true })
}

export async function renameEntry(root: string, fromRelPath: string, toRelPath: string): Promise<void> {
  const fromAbs = safeResolve(root, fromRelPath)
  const toAbs = safeResolve(root, toRelPath)
  await fs.mkdir(resolvePath(toAbs, '..'), { recursive: true })
  await fs.rename(fromAbs, toAbs)
}

export async function deleteEntry(root: string, relPath: string): Promise<void> {
  const abs = safeResolve(root, relPath)
  await fs.rm(abs, { recursive: true, force: true })
}
