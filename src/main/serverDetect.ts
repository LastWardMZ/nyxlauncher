import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { join } from 'path'
import extractZip from 'extract-zip'
import type { JavaVersionCheck } from '../shared/types'

/**
 * Best-effort convenience for the wizard: if the folder the user picked
 * already has exactly one .jar sitting in it (e.g. they downloaded Paper
 * manually, or are pointing at an existing install), prefill the executable
 * field instead of making them browse for it.
 */
export async function detectServerJar(dir: string): Promise<string | null> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const jars = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jar'))
  if (jars.length !== 1) return null
  return join(dir, jars[0].name)
}

/**
 * Extracts a server .zip a user already has (exported from another host,
 * downloaded manually, whatever) into destDir, and tries to auto-detect the
 * server jar the same way a freshly-picked folder would. If the archive just
 * wraps everything in one top-level folder — the common case when someone
 * zips a folder via "Compress to zip" — flattens it so the working directory
 * doesn't end up nested (ServerName/ServerName/server.jar).
 */
export async function importServerZip(zipPath: string, destDir: string): Promise<string | null> {
  await fs.mkdir(destDir, { recursive: true })
  await extractZip(zipPath, { dir: destDir })

  const entries = await fs.readdir(destDir, { withFileTypes: true })
  if (entries.length === 1 && entries[0].isDirectory()) {
    const wrapper = join(destDir, entries[0].name)
    const inner = await fs.readdir(wrapper)
    for (const name of inner) {
      await fs.rename(join(wrapper, name), join(destDir, name))
    }
    await fs.rmdir(wrapper)
  }

  return detectServerJar(destDir)
}

/** Runs `<javaPath> -version` and reports what it finds — informational only, since required Java versions vary by Minecraft version rather than having one fixed minimum. */
export function checkJavaVersion(javaPath: string): Promise<JavaVersionCheck> {
  return new Promise((resolve) => {
    execFile(javaPath || 'java', ['-version'], { timeout: 5000 }, (err, _stdout, stderr) => {
      if (err) {
        resolve({ available: false, majorVersion: null, raw: null })
        return
      }
      // `java -version` writes to stderr, e.g.: openjdk version "21.0.3" 2026-...
      const match = stderr.match(/version "(\d+)(?:\.\d+)*/)
      resolve({
        available: true,
        majorVersion: match ? Number(match[1]) : null,
        raw: stderr.split('\n')[0]?.trim() ?? null
      })
    })
  })
}
