import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { join } from 'path'
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
