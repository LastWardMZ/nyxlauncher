import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { createReadStream, promises as fs } from 'fs'
import { extname, join, normalize } from 'path'
import { networkInterfaces } from 'os'
import { WebSocketServer, type WebSocket } from 'ws'
import type { RemoteServerStatus } from '../shared/types'
import * as authManager from './auth/authManager'
import * as sessionManager from './auth/sessionManager'
import { invokeHandler, isKnownChannel, setRemoteBroadcaster } from './remoteBridge'
import { getServers, getSettings } from './store'
import * as tailscaleManager from './remoteAccess/tailscaleManager'

// Serves the same renderer bundle Electron loads locally, plus a small
// /api/* bridge onto the existing IPC handler registry (see remoteBridge.ts)
// and a /ws stream mirroring the app's push-event channels, so a browser on
// the LAN gets the full app rather than a cut-down remote-control view.
// Session auth (cookie, see sessionManager.ts) gates everything except the
// login endpoint and the static assets needed to render the login screen.

const RENDERER_DIR = join(__dirname, '../renderer')
const SESSION_COOKIE = 'nyx_session'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

let server: Server | null = null
let wss: WebSocketServer | null = null
const wsClients = new Set<WebSocket>()

function getLanIp(): string | null {
  const interfaces = networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address
    }
  }
  return null
}

export function getRemoteServerStatus(): RemoteServerStatus {
  if (!server) return { running: false, port: null, lanIp: null }
  const address = server.address()
  if (!address || typeof address === 'string') return { running: false, port: null, lanIp: null }
  return { running: true, port: address.port, lanIp: getLanIp() }
}

/** Throws with a user-facing message if the given (or, by default, the
 *  currently persisted) settings can't be applied — call with the candidate
 *  settings *before* persisting them, so a rejected change never gets saved
 *  to disk, and never tears down an already-running server. */
export function validateRemoteAccessSettings(remoteAccess = getSettings().remoteAccess): void {
  const portInUse = remoteAccess.lanEnabled || remoteAccess.profile === 'tailscale'
  if (!portInUse) return
  const usedPorts = new Set(getServers().map((s) => s.port))
  if (usedPorts.has(remoteAccess.lanPort)) {
    throw new Error(`El puerto ${remoteAccess.lanPort} ya lo usa uno de tus servidores de Minecraft`)
  }
}

/** LAN wins outright (0.0.0.0 covers Tailscale's interface too); otherwise,
 *  if the Tailscale profile is actually connected, bind only its tailnet IP
 *  — genuinely unreachable from the raw LAN, not just "off by policy"; else
 *  nothing is enabled and the server shouldn't run at all. */
async function resolveBindAddress(remoteAccess = getSettings().remoteAccess): Promise<string | null> {
  if (remoteAccess.lanEnabled) return '0.0.0.0'
  if (remoteAccess.profile === 'tailscale') {
    const status = await tailscaleManager.getStatus()
    if (status.connected && status.tailscaleIp) return status.tailscaleIp
  }
  return null
}

export async function startRemoteServer(): Promise<void> {
  validateRemoteAccessSettings()
  await stopRemoteServer()

  const settings = getSettings().remoteAccess
  const bindAddress = await resolveBindAddress(settings)
  if (!bindAddress) return

  server = createServer((req, res) => {
    void handleRequest(req, res)
  })
  wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || !isAuthenticated(req)) {
      socket.destroy()
      return
    }
    wss?.handleUpgrade(req, socket, head, (ws) => {
      wsClients.add(ws)
      ws.on('close', () => wsClients.delete(ws))
    })
  })

  setRemoteBroadcaster((channel, payload) => {
    const message = JSON.stringify({ channel, payload })
    for (const client of wsClients) {
      if (client.readyState === client.OPEN) client.send(message)
    }
  })

  await new Promise<void>((resolve, reject) => {
    server?.on('error', reject)
    server?.listen(settings.lanPort, bindAddress, () => resolve())
  })
}

export async function stopRemoteServer(): Promise<void> {
  setRemoteBroadcaster(null)
  for (const client of wsClients) client.close()
  wsClients.clear()
  wss?.close()
  wss = null
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()))
    server = null
  }
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

function getSessionToken(req: IncomingMessage): string | null {
  return parseCookies(req)[SESSION_COOKIE] ?? null
}

function isAuthenticated(req: IncomingMessage): boolean {
  const token = getSessionToken(req)
  return token !== null && sessionManager.touchSession(token) !== null
}

function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : ({} as T)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://internal')

    if (url.pathname === '/api/auth/status' && req.method === 'GET') {
      sendJson(res, 200, {
        accountConfigured: authManager.isAccountConfigured(),
        authenticated: isAuthenticated(req)
      })
      return
    }

    if (url.pathname === '/api/auth/setup' && req.method === 'POST') {
      const { password } = await readJsonBody<{ password: string }>(req)
      authManager.setPassword(password)
      issueSession(req, res)
      return
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const { password } = await readJsonBody<{ password: string }>(req)
      if (!authManager.verifyPassword(password)) {
        sendJson(res, 401, { error: 'Contraseña incorrecta' })
        return
      }
      issueSession(req, res)
      return
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const token = getSessionToken(req)
      if (token) {
        const id = sessionManager.touchSession(token)
        if (id) sessionManager.revokeSession(id)
      }
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
      sendJson(res, 200, { ok: true })
      return
    }

    // Everything else — API bridge and the app itself — requires a session.
    if (!isAuthenticated(req)) {
      if (url.pathname.startsWith('/api/')) {
        sendJson(res, 401, { error: 'No autenticado' })
        return
      }
      // Not an API call: fall through to serveStatic, which itself always
      // serves index.html for unknown paths — the SPA shows its own login
      // screen once it calls /api/auth/status and sees authenticated: false.
    }

    if (url.pathname === '/api/invoke' && req.method === 'POST') {
      const { channel, args } = await readJsonBody<{ channel: string; args: unknown[] }>(req)
      if (!isKnownChannel(channel)) {
        sendJson(res, 404, { error: `Canal desconocido: ${channel}` })
        return
      }
      try {
        const result = await invokeHandler(channel, args ?? [])
        sendJson(res, 200, { result })
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) })
      }
      return
    }

    await serveStatic(url.pathname, res)
  } catch (err) {
    console.error('remote server error:', err)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
}

function issueSession(req: IncomingMessage, res: ServerResponse): void {
  const { token } = sessionManager.createSession(req.headers['user-agent'] ?? 'unknown', clientIp(req))
  // No `Secure` flag yet: Phase 1/2 (LAN, Tailscale) are plain HTTP by
  // design. Phase 3 sits behind Cloudflare/Caddy TLS termination and must
  // add `Secure` once that's in place.
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  )
  sendJson(res, 200, { ok: true })
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const safeRelative = normalize(pathname).replace(/^([.]{2}[/\\])+/, '')
  let target = join(RENDERER_DIR, safeRelative)
  if (!target.startsWith(RENDERER_DIR)) target = join(RENDERER_DIR, 'index.html')

  try {
    const stat = await fs.stat(target)
    if (stat.isDirectory()) target = join(target, 'index.html')
  } catch {
    // Unknown path (client-side route, or just a typo) — fall back to the
    // SPA shell so React Router-equivalent in-app navigation still works.
    target = join(RENDERER_DIR, 'index.html')
  }

  try {
    const stat = await fs.stat(target)
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store'
    })
    createReadStream(target).pipe(res)
  } catch {
    res.writeHead(404).end()
  }
}
