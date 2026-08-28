import { spawn, type ChildProcess } from 'child_process'
import { existsSync, promises as fs } from 'fs'
import { join } from 'path'
import dns from 'dns/promises'
import { app } from 'electron'
import treeKill from 'tree-kill'
import { downloadFile } from '../downloadFile'

// Fallback path for a domain that isn't on Cloudflare: a locally-run Caddy
// reverse proxy handles Let's Encrypt automatically. Caddy's own download API
// hands back a ready-to-run binary directly (confirmed via `curl -I
// https://caddyserver.com/api/download?os=windows&arch=amd64` → 200,
// Content-Disposition: attachment; filename="caddy_windows_amd64.exe") — no
// archive to unpack. It doesn't publish a checksum alongside that endpoint,
// so this inherits the same HTTPS-transport-only trust as the original
// mapCliManager.ts precedent (already flagged in the Fase 3 risk notes) —
// weaker than the sha256-verified Tailscale/Cloudflare downloads, and this
// is the least-used of the three paths (only when the domain isn't already
// on Cloudflare), so it's the one place that's acceptable for now.

const EXE_DIR = join(app.getPath('userData'), 'caddy')
const EXE_PATH = join(EXE_DIR, 'caddy.exe')

let runningProc: ChildProcess | null = null

export function isInstalled(): boolean {
  return existsSync(EXE_PATH)
}

export async function install(onProgress?: (downloadedBytes: number, totalBytes: number | null) => void): Promise<void> {
  await fs.mkdir(EXE_DIR, { recursive: true })
  await downloadFile('https://caddyserver.com/api/download?os=windows&arch=amd64', EXE_PATH, onProgress)
}

/** Resolves the domain's public A/AAAA record and reports whether it points
 *  anywhere at all — we can't know the user's actual public IP reliably from
 *  inside a NAT'd home network, so this only catches "doesn't resolve yet",
 *  not "resolves to the wrong address". */
export async function checkDns(domain: string): Promise<{ resolves: boolean; addresses: string[] }> {
  try {
    const addresses = await dns.resolve4(domain).catch(() => dns.resolve6(domain))
    return { resolves: addresses.length > 0, addresses }
  } catch {
    return { resolves: false, addresses: [] }
  }
}

export async function start(domain: string, localPort: number): Promise<void> {
  await stop()
  // Caddy's one-line reverse proxy syntax handles ACME/Let's Encrypt (both
  // the certificate and renewal) automatically for a public domain — no
  // Caddyfile needed on disk.
  const proc = spawn(EXE_PATH, ['reverse-proxy', '--from', domain, '--to', `127.0.0.1:${localPort}`], {
    windowsHide: true
  })
  runningProc = proc
  proc.on('exit', () => {
    if (runningProc === proc) runningProc = null
  })
}

export async function stop(): Promise<void> {
  if (runningProc?.pid) {
    await new Promise<void>((resolve) => treeKill(runningProc!.pid!, 'SIGKILL', () => resolve()))
  }
  runningProc = null
}

export function isRunning(): boolean {
  return runningProc !== null
}
