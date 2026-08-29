import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

// Small hand-rolled replacement for `electron-store`. The only reason it
// existed here was `.get`/`.set` against a JSON file — that's the entire
// surface this app actually uses (grepped: no `.delete`/`.clear`/
// `.onDidChange`/schema validation anywhere). Electron-store itself
// transitively imports `'electron'` at module load (even though this app
// always passed an explicit `cwd`, never relying on its `app.getPath`
// default), which caused real friction — both a `tsc` type-resolution
// failure and an unverified runtime risk — for the headless/Docker core
// build (see coreIndex.ts), which never has a real Electron runtime.
// Replacing it removes that friction for both builds at once, with a
// dependency's worth of leverage the app never used.
export class JsonStore<T extends object> {
  private readonly filePath: string
  private data: T

  constructor(opts: { name: string; cwd: string; defaults: T }) {
    this.filePath = join(opts.cwd, `${opts.name}.json`)
    this.data = { ...opts.defaults, ...this.readFromDisk() }
  }

  private readFromDisk(): Partial<T> {
    if (!existsSync(this.filePath)) return {}
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<T>
    } catch {
      return {}
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.data[key]
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data = { ...this.data, [key]: value }
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8')
  }
}
