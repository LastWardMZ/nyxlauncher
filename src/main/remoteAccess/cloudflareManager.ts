import { spawn, type ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import { join } from 'path'
import treeKill from 'tree-kill'
import { downloadFile } from '../downloadFile'
import { platform } from '../platform/platform'
import type { CloudflareStatus } from '../../shared/types'

// Unlike Tailscale (Fase 2), cloudflared genuinely has a portable Windows
// binary with no installer/service — confirmed via the Chocolatey package
// description ("contains only the standalone binary, and does not configure
// or create services") and the --url "quick tunnel" mode, which needs no
// Cloudflare account at all. So this follows the same download-and-spawn
// pattern as mapCliManager.ts, unlike tailscaleManager.ts.

const IS_WINDOWS = process.platform === 'win32'
const EXE_DIR = join(platform.getDataDir(), 'cloudflared')
// Docker: baked into the image at build time (see Dockerfile) — same
// reasoning as caddyManager.ts's EXE_PATH.
const EXE_PATH = IS_WINDOWS ? join(EXE_DIR, 'cloudflared.exe') : '/usr/local/bin/cloudflared'
const QUICK_TUNNEL_URL_RE = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/i

let runningProc: ChildProcess | null = null
let runningMode: 'quick' | 'domain' | null = null
let lastQuickUrl: string | null = null
let lastError: string | null = null

export function isInstalled(): boolean {
  return existsSync(EXE_PATH)
}

export async function install(onProgress?: (downloadedBytes: number, totalBytes: number | null) => void): Promise<void> {
  if (!IS_WINDOWS) {
    if (isInstalled()) return
    throw new Error('cloudflared debería venir empaquetado en la imagen Docker — reconstruye la imagen')
  }
  const release = await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', {
    headers: { 'User-Agent': 'nyxlauncher' }
  })
  if (!release.ok) throw new Error(`No se pudo consultar la última versión de cloudflared: HTTP ${release.status}`)
  const data = (await release.json()) as { body?: string; assets?: { name: string; browser_download_url: string }[] }

  const asset = data.assets?.find((a) => a.name === 'cloudflared-windows-amd64.exe')
  if (!asset) throw new Error('No se encontró el binario de Windows en la última release de cloudflared')

  const checksumMatch = /^cloudflared-windows-amd64\.exe:\s*([a-f0-9]+)$/m.exec(data.body ?? '')
  if (!checksumMatch) throw new Error('No se pudo leer la suma de verificación de cloudflared en las notas de la release')
  const expectedSha256 = checksumMatch[1]

  await fs.mkdir(EXE_DIR, { recursive: true })
  const tmpPath = `${EXE_PATH}.download`
  await downloadFile(asset.browser_download_url, tmpPath, onProgress)

  const actualSha256 = createHash('sha256').update(await fs.readFile(tmpPath)).digest('hex')
  if (actualSha256 !== expectedSha256) {
    await fs.rm(tmpPath, { force: true })
    throw new Error('La suma de verificación de cloudflared no coincide — descarga corrupta o manipulada')
  }

  await fs.rename(tmpPath, EXE_PATH)
}

export function getStatus(): CloudflareStatus {
  if (!isInstalled()) return { installed: false, running: false, mode: 'off', publicUrl: null, error: null }
  if (!runningProc || !runningMode) return { installed: true, running: false, mode: 'off', publicUrl: null, error: lastError }
  return {
    installed: true,
    running: true,
    mode: runningMode,
    publicUrl: runningMode === 'quick' ? lastQuickUrl : lastQuickUrl, // domain mode's URL is the configured custom domain, set by the caller via setDomainUrl
    error: lastError
  }
}

/** For the "domain" mode, the reachable URL is just the configured custom
 *  domain (known before the tunnel even connects) rather than something
 *  parsed from process output — the caller (ipc.ts) sets it once, after
 *  DNS/ingress are configured, right before spawning `tunnel run`. */
export function setDomainUrl(url: string | null): void {
  lastQuickUrl = url
}

async function stopExisting(): Promise<void> {
  if (runningProc?.pid) {
    await new Promise<void>((resolve) => treeKill(runningProc!.pid!, 'SIGKILL', () => resolve()))
  }
  runningProc = null
  runningMode = null
  lastQuickUrl = null
  lastError = null
}

/** No Cloudflare account needed — free, ephemeral *.trycloudflare.com URL. */
export async function connectQuick(localPort: number, onUrl: (url: string) => void): Promise<void> {
  await stopExisting()
  lastError = null
  const proc = spawn(EXE_PATH, ['tunnel', '--url', `http://127.0.0.1:${localPort}`], { windowsHide: true })
  runningProc = proc
  runningMode = 'quick'

  const handleChunk = (chunk: Buffer): void => {
    if (lastQuickUrl) return
    const match = QUICK_TUNNEL_URL_RE.exec(chunk.toString('utf8'))
    if (match) {
      lastQuickUrl = match[1]
      onUrl(match[1])
    }
  }
  proc.stdout?.on('data', handleChunk)
  proc.stderr?.on('data', handleChunk)
  proc.on('exit', (code) => {
    if (runningProc === proc) {
      runningProc = null
      runningMode = null
      if (code !== 0 && code !== null) lastError = `cloudflared terminó con código ${code}`
    }
  })
}

/** Runs a named tunnel already configured (DNS + ingress) via the Cloudflare
 *  API — see cloudflareApi.ts. `token` is the tunnel's run token, not the
 *  user's API token. */
export async function connectWithToken(token: string): Promise<void> {
  await stopExisting()
  lastError = null
  const proc = spawn(EXE_PATH, ['tunnel', 'run', '--token', token], { windowsHide: true })
  runningProc = proc
  runningMode = 'domain'

  let tail = ''
  const collect = (chunk: Buffer): void => {
    tail = (tail + chunk.toString('utf8')).slice(-1000)
  }
  proc.stdout?.on('data', collect)
  proc.stderr?.on('data', collect)
  proc.on('exit', (code) => {
    if (runningProc === proc) {
      runningProc = null
      runningMode = null
      if (code !== 0 && code !== null) lastError = tail.trim().slice(-500) || `cloudflared terminó con código ${code}`
    }
  })
}

export async function disconnect(): Promise<void> {
  await stopExisting()
}
