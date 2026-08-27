import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { createReadStream, promises as fs } from 'fs'
import { extname, join } from 'path'
import { safeResolve } from './fileManagerCore'
import type { ServerConfig } from '../shared/types'

// Static file server for BlueMap's generated web app (src/main/mapManager.ts
// installs/configures BlueMap itself; this just serves <workingDirectory>/bluemap/web/
// over http:// so the renderer can embed it in an iframe — file:// URLs don't
// work well for a site that does its own relative fetch()es). One shared
// server for the whole app, routed by serverId, rather than one per server —
// avoids juggling a growing set of ports.
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.gz': 'application/gzip'
}

let server: Server | null = null
let port: number | null = null

export function getMapServerPort(): number | null {
  return port
}

export function startMapHttpServer(getServers: () => ServerConfig[]): Promise<number> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      void handleRequest(req, res, getServers)
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server?.address()
      if (!address || typeof address === 'string') {
        reject(new Error('No se pudo iniciar el servidor de mapas'))
        return
      }
      port = address.port
      resolve(port)
    })
  })
}

export function stopMapHttpServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => resolve())
    server = null
  })
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, getServers: () => ServerConfig[]): Promise<void> {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }

    const url = new URL(req.url ?? '', 'http://internal')
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'map' || !parts[1]) {
      res.writeHead(400).end()
      return
    }

    const serverId = decodeURIComponent(parts[1])
    const restParts = parts.slice(2).map((p) => decodeURIComponent(p))
    const targetServer = getServers().find((s) => s.id === serverId)
    if (!targetServer) {
      res.writeHead(404).end()
      return
    }

    let target: string
    try {
      const webRoot = safeResolve(targetServer.workingDirectory, 'bluemap/web')
      target = safeResolve(webRoot, restParts.join('/') || 'index.html')
    } catch {
      res.writeHead(400).end()
      return
    }

    let stat
    try {
      stat = await fs.stat(target)
      if (stat.isDirectory()) {
        target = join(target, 'index.html')
        stat = await fs.stat(target)
      }
    } catch {
      // BlueMap pre-gzips some generated files on disk (e.g. textures.json is
      // actually written as textures.json.gz) but its own web client fetches
      // the plain path — serve the .gz variant with Content-Encoding: gzip so
      // the browser decompresses it transparently, matching what a static
      // webserver with "gzip_static" would do.
      let gzipStat
      try {
        gzipStat = await fs.stat(`${target}.gz`)
      } catch {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'Content-Encoding': 'gzip',
        'Content-Length': gzipStat.size,
        'Cache-Control': 'no-store'
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      createReadStream(`${target}.gz`).pipe(res)
      return
    }

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store'
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(target).pipe(res)
  } catch (err) {
    console.error('map http server error:', err)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
}
