import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { downloadFile } from '../downloadFile'
import type { TailscaleStatus } from '../../shared/types'

// Unlike BlueMap's CLI (mapCliManager.ts), tailscaled on Windows cannot run as
// a plain spawned child process — Tailscale itself runs it as a Windows
// service ("Tailscale"), installed via the official MSI, which requires an
// admin/UAC elevation. There's no supported unprivileged mode
// (tailscale/tailscale#2791 is still open). So this module drives the real
// `tailscale.exe` CLI against that service instead of managing a process of
// its own — there's nothing here to track/tree-kill/persist a manifest for,
// the service already persists all connection state.

const MSI_ALIAS_URL = 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi'
const DEFAULT_EXE_PATH = 'C:\\Program Files\\Tailscale\\tailscale.exe'
const AUTH_URL_RE = /(https:\/\/login\.tailscale\.com\/a\/\S+)/

function resolveExePath(): string {
  return existsSync(DEFAULT_EXE_PATH) ? DEFAULT_EXE_PATH : 'tailscale'
}

function runTailscale(args: string[], timeoutMs = 15000): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(resolveExePath(), args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('tailscale no respondió a tiempo'))
    }, timeoutMs)
    proc.stdout?.on('data', (c: Buffer) => (stdout += c.toString('utf8')))
    proc.stderr?.on('data', (c: Buffer) => (stderr += c.toString('utf8')))
    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code })
    })
  })
}

export async function isInstalled(): Promise<boolean> {
  if (existsSync(DEFAULT_EXE_PATH)) return true
  try {
    const { code } = await runTailscale(['version'], 5000)
    return code === 0
  } catch {
    return false
  }
}

export async function install(onProgress?: (downloadedBytes: number, totalBytes: number | null) => void): Promise<void> {
  // Resolve the "latest" alias to a real versioned URL first — Tailscale only
  // publishes a .sha256 sidecar next to the versioned file, not the alias.
  const head = await fetch(MSI_ALIAS_URL, { method: 'HEAD' })
  if (!head.ok) throw new Error(`No se pudo resolver el instalador de Tailscale: HTTP ${head.status}`)
  const resolvedUrl = head.url

  const shaRes = await fetch(`${resolvedUrl}.sha256`)
  if (!shaRes.ok) throw new Error('No se pudo obtener la suma de verificación del instalador de Tailscale')
  const expectedSha256 = (await shaRes.text()).trim().split(/\s+/)[0]

  const msiPath = join(app.getPath('temp'), 'nyxlauncher-tailscale-setup.msi')
  await downloadFile(resolvedUrl, msiPath, onProgress)

  const actualSha256 = createHash('sha256').update(await fs.readFile(msiPath)).digest('hex')
  if (actualSha256 !== expectedSha256) {
    await fs.rm(msiPath, { force: true })
    throw new Error('La suma de verificación del instalador de Tailscale no coincide — descarga corrupta o manipulada')
  }

  // msiexec triggers Windows' own UAC elevation prompt for a per-machine
  // service install — nothing extra needed here to request elevation.
  // TS_NOLAUNCH=1 stops it from opening the Tailscale tray app afterwards,
  // since we drive everything through the CLI ourselves.
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('msiexec', ['/i', msiPath, '/quiet', 'TS_NOLAUNCH=1'], { windowsHide: true })
    proc.on('error', reject)
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(code === 1602 ? 'Instalación cancelada' : `El instalador de Tailscale terminó con código ${code}`))
    })
  })

  await fs.rm(msiPath, { force: true }).catch(() => {})
}

/** Runs `tailscale up`. Resolves once connected; calls onAuthUrl as soon as a
 *  login URL appears in the output, for the caller to show as a link/QR. */
export async function connect(onAuthUrl: (url: string) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(resolveExePath(), ['up'], { windowsHide: true })
    let seenUrl = false
    const handleChunk = (chunk: Buffer): void => {
      if (seenUrl) return
      const match = AUTH_URL_RE.exec(chunk.toString('utf8'))
      if (match) {
        seenUrl = true
        onAuthUrl(match[1])
      }
    }
    proc.stdout?.on('data', handleChunk)
    proc.stderr?.on('data', handleChunk)
    proc.on('error', reject)
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`No se pudo conectar con Tailscale (código ${code})`))
    })
  })
}

export async function disconnect(): Promise<void> {
  await runTailscale(['down'])
}

interface TailscaleStatusJson {
  BackendState?: string
  Self?: { DNSName?: string; TailscaleIPs?: string[]; Online?: boolean }
}

export async function getStatus(): Promise<TailscaleStatus> {
  const installed = await isInstalled()
  if (!installed) return { installed: false, connected: false, hostname: null, tailscaleIp: null, authUrl: null }

  try {
    const { stdout, code } = await runTailscale(['status', '--json'], 8000)
    if (code !== 0) return { installed: true, connected: false, hostname: null, tailscaleIp: null, authUrl: null }
    const parsed = JSON.parse(stdout) as TailscaleStatusJson
    const connected = parsed.BackendState === 'Running' && Boolean(parsed.Self?.Online ?? true)
    return {
      installed: true,
      connected,
      hostname: connected ? (parsed.Self?.DNSName?.replace(/\.$/, '') ?? null) : null,
      tailscaleIp: connected ? (parsed.Self?.TailscaleIPs?.[0] ?? null) : null,
      authUrl: null
    }
  } catch {
    return { installed: true, connected: false, hostname: null, tailscaleIp: null, authUrl: null }
  }
}
