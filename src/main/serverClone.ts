import { promises as fs } from 'fs'
import { join } from 'path'
import type { ServerConfig } from '../shared/types'

/** Windows forbids these in path segments; harmless to strip everywhere. */
function sanitizeFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim() || 'server'
}

async function readLevelName(server: ServerConfig): Promise<string> {
  try {
    const raw = await fs.readFile(join(server.workingDirectory, server.configFilePath), 'utf8')
    const match = raw.match(/^level-name=(.*)$/m)
    return match?.[1]?.trim() || 'world'
  } catch {
    return 'world'
  }
}

/** Copies a server's working directory to a new location, skipping its world
 *  save(s) — cloning is for spinning up a variant with the same mods/config/
 *  jar, not for duplicating gigabytes of world data. Paper/Purpur split the
 *  nether/end into sibling folders named after level-name, so all three get
 *  excluded together. */
export async function cloneServerFiles(source: ServerConfig, destDir: string): Promise<void> {
  const levelName = await readLevelName(source)
  const excludeDirs = new Set([levelName, `${levelName}_nether`, `${levelName}_the_end`])

  await fs.mkdir(destDir, { recursive: true })
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(source.workingDirectory, { withFileTypes: true })
  } catch {
    return // nothing to copy (e.g. a server whose folder was never created)
  }

  for (const entry of entries) {
    if (entry.isDirectory() && excludeDirs.has(entry.name)) continue
    const srcPath = join(source.workingDirectory, entry.name)
    const destPath = join(destDir, entry.name)
    await fs.cp(srcPath, destPath, { recursive: true })
  }
}

export { sanitizeFolderName }
