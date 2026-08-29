// Thin seam between business logic (ipc.ts, fileManager.ts, backupManager.ts,
// secretsStore.ts, the remoteAccess/* managers) and whichever runtime is
// actually hosting it — the real Electron desktop app, or the plain-Node
// headless core used by Docker.
//
// This file itself must NEVER import from 'electron' or any Node-only
// module, so it's safe to sit in both index.ts's and coreIndex.ts's module
// graphs. `platform.electron.ts` is imported (and calls setPlatform) only
// from index.ts; `platform.node.ts` only from coreIndex.ts — neither ever
// appears in the other entrypoint's import graph, so a plain `node` process
// never touches a static `import ... from 'electron'` (which fails hard
// under Node's ESM loader — 'electron' resolves to a CJS module whose
// export is a plain string, the path to the binary, when not actually run
// by that binary).

/** Minimal stand-in for Electron's BrowserWindow — the platform layer only
 *  ever needs "is there one, or not" to decide whether a native file picker
 *  can be shown. Concrete callers keep using the real `BrowserWindow` type
 *  from 'electron' (type-only imports are erased at compile time, so they
 *  don't pull in the runtime module). */
export type WindowHandle = unknown

export interface Platform {
  /** Root directory for persisted config/secrets/backups — the desktop
   *  build's `app.getPath('userData')`, or `NYXLAUNCHER_DATA_DIR` in Docker. */
  getDataDir(): string
  getTempDir(): string
  getAppVersion(): string
  isPackaged(): boolean
  pickDirectory(win: WindowHandle): Promise<string | null>
  pickFile(win: WindowHandle, filters?: { name: string; extensions: string[] }[]): Promise<string | null>
  /** Multi-select "open file(s)" picker — used by the files tab's import. */
  pickFilesToImport(win: WindowHandle): Promise<string[]>
  /** "Choose a save location" picker for exporting a single file. */
  pickSaveFile(win: WindowHandle, defaultName: string): Promise<string | null>
  notify(title: string, body: string): void
  setLaunchOnStartup(enabled: boolean): void
  /** No-op in Docker/headless — updates there are `docker pull` + recreate,
   *  not electron-updater's Windows-oriented feed. */
  checkForUpdates(): void
  /** Encrypt-at-rest for the secrets blob (password hash, TOTP secret,
   *  Cloudflare/Resend credentials) — DPAPI/Keychain/libsecret via
   *  Electron's safeStorage on desktop, AES-256-GCM via Node's own `crypto`
   *  in Docker (see platform.node.ts for the key-management rationale).
   *  Both return/accept a single opaque base64 string so `store.ts`'s
   *  `remoteAccessSecrets` field shape never changes. Throws if encryption
   *  isn't available/the blob can't be decrypted. */
  encryptString(plain: string): string
  decryptString(blob: string): string
}

let current: Platform | null = null

export function setPlatform(p: Platform): void {
  current = p
}

function get(): Platform {
  if (!current) throw new Error('Platform not initialized — setPlatform() must run before any other module logic')
  return current
}

export const platform: Platform = {
  getDataDir: () => get().getDataDir(),
  getTempDir: () => get().getTempDir(),
  getAppVersion: () => get().getAppVersion(),
  isPackaged: () => get().isPackaged(),
  pickDirectory: (win) => get().pickDirectory(win),
  pickFile: (win, filters) => get().pickFile(win, filters),
  pickFilesToImport: (win) => get().pickFilesToImport(win),
  pickSaveFile: (win, defaultName) => get().pickSaveFile(win, defaultName),
  notify: (title, body) => get().notify(title, body),
  setLaunchOnStartup: (enabled) => get().setLaunchOnStartup(enabled),
  checkForUpdates: () => get().checkForUpdates(),
  encryptString: (plain) => get().encryptString(plain),
  decryptString: (blob) => get().decryptString(blob)
}
