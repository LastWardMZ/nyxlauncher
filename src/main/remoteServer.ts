import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { createReadStream, promises as fs } from 'fs'
import { extname, join, normalize } from 'path'
import { networkInterfaces } from 'os'
import { WebSocketServer, type WebSocket } from 'ws'
import type { RemoteServerStatus } from '../shared/types'
import * as authManager from './auth/authManager'
import * as sessionManager from './auth/sessionManager'
import * as totpManager from './auth/totpManager'
import * as rateLimiter from './auth/rateLimiter'
import * as accessLog from './auth/accessLog'
import * as deviceManager from './auth/deviceManager'
import * as emailSender from './auth/emailSender'
import { isIpAllowed } from './auth/ipAllowlist'
import { invokeHandler, isKnownChannel, setRemoteBroadcaster } from './remoteBridge'
import { getServers, getSettings } from './store'
import * as tailscaleManager from './remoteAccess/tailscaleManager'
import * as cloudflareManager from './remoteAccess/cloudflareManager'
import * as caddyManager from './remoteAccess/caddyManager'

// Serves the same renderer bundle Electron loads locally, plus a small
// /api/* bridge onto the existing IPC handler registry (see remoteBridge.ts)
// and a /ws stream mirroring the app's push-event channels, so a browser on
// the LAN gets the full app rather than a cut-down remote-control view.
// Session auth (cookie, see sessionManager.ts) gates everything except the
// login endpoint and the static assets needed to render the login screen.

const RENDERER_DIR = join(__dirname, '../renderer')
const SESSION_COOKIE = 'nyx_session'
const DEVICE_COOKIE = 'nyx_device'

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
  const portInUse = remoteAccess.lanEnabled || remoteAccess.profile === 'tailscale' || remoteAccess.profile === 'cloudflare'
  if (!portInUse) return
  const usedPorts = new Set(getServers().map((s) => s.port))
  if (usedPorts.has(remoteAccess.lanPort)) {
    throw new Error(`El puerto ${remoteAccess.lanPort} ya lo usa uno de tus servidores de Minecraft`)
  }
}

/** LAN wins outright (0.0.0.0 covers Tailscale's/Cloudflare's traffic too);
 *  otherwise Tailscale connected → bind only its tailnet IP (genuinely
 *  unreachable from the raw LAN); otherwise Cloudflare active → 127.0.0.1
 *  (the tunnel dials *out* to Cloudflare's edge, so the local server never
 *  needs to listen on any real network interface); else nothing is enabled
 *  and the server shouldn't run at all. */
async function resolveBindAddress(remoteAccess = getSettings().remoteAccess): Promise<string | null> {
  if (remoteAccess.lanEnabled) return '0.0.0.0'
  if (remoteAccess.profile === 'tailscale') {
    const status = await tailscaleManager.getStatus()
    if (status.connected && status.tailscaleIp) return status.tailscaleIp
  }
  if (remoteAccess.profile === 'cloudflare') {
    if (cloudflareManager.getStatus().running || caddyManager.isRunning()) return '127.0.0.1'
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

/** Only trusts the `Cf-Connecting-Ip` header cloudflared adds when the TCP
 *  connection itself came from loopback — i.e. cloudflared running locally
 *  is the one talking to us. A real external attacker (over LAN/Tailscale)
 *  can never make their own socket appear as 127.0.0.1 to this server, so
 *  they can't spoof this header to dodge the rate limiter/allowlist. */
function resolveClientIp(req: IncomingMessage): string {
  const socketIp = req.socket.remoteAddress ?? 'unknown'
  const isLoopback = socketIp === '127.0.0.1' || socketIp === '::1' || socketIp === '::ffff:127.0.0.1'
  if (isLoopback) {
    const cfIp = req.headers['cf-connecting-ip']
    if (typeof cfIp === 'string' && cfIp) return cfIp
  }
  return socketIp
}

function appendSetCookie(res: ServerResponse, cookieStr: string): void {
  const existing = res.getHeader('Set-Cookie')
  const arr = existing ? (Array.isArray(existing) ? existing.map(String) : [String(existing)]) : []
  res.setHeader('Set-Cookie', [...arr, cookieStr])
}

/** Reads the long-lived device-fingerprint cookie, planting one if this is
 *  the visitor's first contact. Separate from the session cookie — it
 *  outlives logout, so a device that's been approved once stays recognized. */
function getOrCreateDeviceCookie(req: IncomingMessage, res: ServerResponse): string {
  const existing = parseCookies(req)[DEVICE_COOKIE]
  if (existing) return existing
  const value = deviceManager.generateDeviceCookieValue()
  appendSetCookie(res, `${DEVICE_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 730}`)
  return value
}

/** Base URL for the one-time links (device approval, session revoke) that
 *  go out by email. Deliberately does NOT trust the client-supplied `Host`
 *  header once the public/Cloudflare profile is what makes those links
 *  security-sensitive in the first place — LAN can be enabled concurrently
 *  with Cloudflare, and the raw HTTP listener bound to 0.0.0.0 would
 *  otherwise let an already-authenticated LAN attacker spoof `Host` to
 *  redirect an admin's approval click to an attacker-controlled origin,
 *  silently self-approving their own pending device. Uses the tracked
 *  public tunnel URL instead, which only reflects what actually got
 *  provisioned via the Cloudflare API/quick tunnel, not client input. */
function originForRequest(req: IncomingMessage): string {
  if (getSettings().remoteAccess.profile === 'cloudflare') {
    const publicUrl = cloudflareManager.getStatus().publicUrl
    if (publicUrl) return publicUrl.replace(/\/$/, '')
  }
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
  return `${proto}://${req.headers.host}`
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
      issueSession(req, res, null)
      sendJson(res, 200, { ok: true })
      return
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      await handleLogin(req, res)
      return
    }

    if (url.pathname === '/api/auth/pending-status' && req.method === 'GET') {
      const pendingId = url.searchParams.get('pendingId')
      if (!pendingId || !deviceManager.isDeviceTrusted(pendingId)) {
        sendJson(res, 200, { approved: false })
        return
      }
      const ip = resolveClientIp(req)
      const userAgent = req.headers['user-agent'] ?? 'unknown'
      const sessionId = issueSession(req, res, pendingId)
      accessLog.record(ip, 'success', userAgent)
      void emailSender.sendNewLoginEmail(`${originForRequest(req)}/api/session-revoke/${sessionId}`, ip, userAgent)
      sendJson(res, 200, { approved: true })
      return
    }

    const approvalMatch = /^\/api\/device-approval\/([a-f0-9]+)$/.exec(url.pathname)
    if (approvalMatch && req.method === 'GET') {
      const approved = deviceManager.approveByToken(approvalMatch[1]) !== null
      sendHtml(
        res,
        approved
          ? '<h2>Dispositivo aprobado</h2><p>Ya puedes volver a la otra pestaña — el acceso se completará solo.</p>'
          : '<h2>Enlace no válido</h2><p>Puede que ya se haya usado o haya caducado.</p>'
      )
      return
    }

    const revokeMatch = /^\/api\/session-revoke\/([a-f0-9-]+)$/.exec(url.pathname)
    if (revokeMatch && req.method === 'GET') {
      sessionManager.revokeSession(revokeMatch[1])
      sendHtml(res, '<h2>Sesión revocada</h2><p>Ese acceso ya no es válido.</p>')
      return
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const token = getSessionToken(req)
      if (token) {
        const id = sessionManager.touchSession(token)
        if (id) sessionManager.revokeSession(id)
      }
      appendSetCookie(res, `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
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

function issueSession(req: IncomingMessage, res: ServerResponse, deviceId: string | null): string {
  const { token, id } = sessionManager.createSession(req.headers['user-agent'] ?? 'unknown', resolveClientIp(req), deviceId)
  // `Secure` once traffic is genuinely HTTPS (Cloudflare/Caddy terminate TLS
  // in front of us) — plain HTTP by design for LAN/Tailscale (Phases 1-2).
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  appendSetCookie(res, `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`)
  return id
}

function sendHtml(res: ServerResponse, bodyHtml: string): void {
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#e5e5e5;background:#0b0d12">${bodyHtml}</body></html>`
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) })
  res.end(html)
}

async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ip = resolveClientIp(req)
  const userAgent = req.headers['user-agent'] ?? 'unknown'
  const settings = getSettings().remoteAccess

  if (!isIpAllowed(ip, settings.ipAllowlist)) {
    accessLog.record(ip, 'blocked', userAgent)
    sendJson(res, 403, { ok: false, error: 'Esta IP no está en la lista blanca' })
    return
  }

  const lockoutMs = rateLimiter.getLockoutRemainingMs(ip)
  if (lockoutMs > 0) {
    accessLog.record(ip, 'blocked', userAgent)
    sendJson(res, 429, { ok: false, error: `Demasiados intentos — prueba de nuevo en ${Math.ceil(lockoutMs / 60_000)} min` })
    return
  }

  const { password, totpCode } = await readJsonBody<{ password: string; totpCode?: string }>(req)

  if (!authManager.verifyPassword(password ?? '')) {
    rateLimiter.recordFailure(ip)
    accessLog.record(ip, 'failure', userAgent)
    sendJson(res, 401, { ok: false, error: 'Contraseña incorrecta' })
    return
  }

  if (settings.totpEnabled) {
    if (!totpCode) {
      sendJson(res, 200, { ok: false, needsTotp: true })
      return
    }
    if (!(await totpManager.checkCode(totpCode))) {
      rateLimiter.recordFailure(ip)
      accessLog.record(ip, 'failure', userAgent)
      sendJson(res, 401, { ok: false, needsTotp: true, error: 'Código incorrecto' })
      return
    }
  }

  rateLimiter.recordSuccess(ip)

  let deviceId: string | null = null
  if (settings.profile === 'cloudflare') {
    const deviceCookie = getOrCreateDeviceCookie(req, res)
    const fp = deviceManager.fingerprint(deviceCookie, userAgent)
    const check = deviceManager.checkDevice(fp)
    if (check.status === 'unknown') {
      const { deviceId: pendingId, approvalToken } = deviceManager.createPendingApproval(fp, ip, userAgent)
      const approveUrl = `${originForRequest(req)}/api/device-approval/${approvalToken}`
      void emailSender.sendDeviceApprovalEmail(approveUrl, ip, userAgent)
      accessLog.record(ip, 'blocked', userAgent)
      sendJson(res, 200, { ok: false, pendingApproval: true, pendingId })
      return
    }
    if (check.status === 'pending') {
      sendJson(res, 200, { ok: false, pendingApproval: true, pendingId: check.deviceId })
      return
    }
    deviceId = check.deviceId
  }

  const sessionId = issueSession(req, res, deviceId)
  accessLog.record(ip, 'success', userAgent)
  const revokeUrl = `${originForRequest(req)}/api/session-revoke/${sessionId}`
  void emailSender.sendNewLoginEmail(revokeUrl, ip, userAgent)
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
