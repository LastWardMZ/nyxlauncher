// Headless entrypoint for Docker/self-hosted deployments — plain Node, no
// Electron runtime at all (see docker-spike/ history: running the real
// Electron main process headless inside a container hangs forever at
// `app.whenReady()`; this entrypoint reuses the exact same business logic
// — ipc.ts, remoteServer.ts, serverManager.ts, etc. — through the platform
// adapter instead of Electron's app/BrowserWindow/dialog/ipcMain).
//
// Structurally always headless — assert it before any other module (e.g.
// remoteServer.ts's resolveBindAddress()) reads the env var, regardless of
// whether the surrounding deployment already set it.
process.env.NYXLAUNCHER_HEADLESS = '1'

// Must be the first local import — populates the platform adapter before
// anything else (e.g. remoteAccess/*Manager.ts, which compute data-dir
// paths at module load time) can call it.
import './platform/bootstrapNode'
import { registerIpcHandlers } from './ipc'
import { serverManager } from './serverManager'
import { getServers, getSettings, saveSettings } from './store'
import * as authManager from './auth/authManager'
import { startMetricsLoop } from './metrics'
import { startMapHttpServer } from './mapHttpServer'
import { startRemoteServer, stopRemoteServer } from './remoteServer'
import { startBackupScheduler } from './backupScheduler'
import { startBuildUpdateChecker } from './buildUpdateChecker'
import { startMapRenderScheduler } from './mapCliScheduler'

let shuttingDown = false

async function shutdown(): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log('Cerrando NyxLauncher...')
  for (const s of getServers()) {
    if (serverManager.isRunning(s.id)) serverManager.kill(s.id)
  }
  await stopRemoteServer()
  process.exit(0)
}

// `NYXLAUNCHER_PANEL_PORT` is the deployment's actual published/exposed
// port (set in docker-compose.yml) — always trust it over whatever's
// persisted, so the panel's own idea of its port can never drift from what
// the compose file actually publishes.
function applyEnvPort(): void {
  const envPort = process.env.NYXLAUNCHER_PANEL_PORT ? Number(process.env.NYXLAUNCHER_PANEL_PORT) : null
  if (!envPort) return
  const settings = getSettings()
  if (settings.remoteAccess.lanPort !== envPort) {
    saveSettings({ ...settings, remoteAccess: { ...settings.remoteAccess, lanPort: envPort } })
  }
}

// Only relevant in NYXLAUNCHER_NETWORK_MODE=portrange (Docker Desktop
// Mac/Windows, see docker-compose.yml) — host mode publishes no fixed
// range, so there's nothing to suggest a port from.
function applyEnvPortRange(): void {
  if (process.env.NYXLAUNCHER_NETWORK_MODE !== 'portrange') return
  const start = process.env.NYXLAUNCHER_PORT_RANGE_START ? Number(process.env.NYXLAUNCHER_PORT_RANGE_START) : null
  const end = process.env.NYXLAUNCHER_PORT_RANGE_END ? Number(process.env.NYXLAUNCHER_PORT_RANGE_END) : null
  if (!start || !end) return
  const settings = getSettings()
  if (settings.dockerPortRange?.start !== start || settings.dockerPortRange?.end !== end) {
    saveSettings({ ...settings, dockerPortRange: { start, end } })
  }
}

// Optional non-interactive first-run bootstrap — if unset, the web setup
// screen (RemoteLoginGate.tsx) works exactly the same as it always has.
// Only ever creates an account; never touches an existing one, so this is
// safe to leave set across restarts/redeploys.
function applyEnvCredentials(): void {
  const username = process.env.NYXLAUNCHER_ADMIN_USERNAME
  const password = process.env.NYXLAUNCHER_ADMIN_PASSWORD
  if (!username || !password) return
  if (authManager.isAccountConfigured()) return
  try {
    authManager.setCredentials(username, password)
    console.log(`Cuenta de administrador "${username}" creada desde NYXLAUNCHER_ADMIN_USERNAME/_PASSWORD.`)
  } catch (err) {
    console.error('No se pudo crear la cuenta desde NYXLAUNCHER_ADMIN_USERNAME/_PASSWORD:', err)
  }
}

async function main(): Promise<void> {
  applyEnvPort()
  applyEnvPortRange()
  applyEnvCredentials()
  await startMapHttpServer(getServers)
  // No local desktop window ever exists in this build — every IPC handler
  // is reached exclusively through remoteServer.ts's HTTP/WS bridge.
  registerIpcHandlers(() => null)
  try {
    await startRemoteServer()
  } catch (err) {
    console.error('No se pudo iniciar el panel remoto:', err)
  }
  startMetricsLoop(serverManager, () =>
    getServers()
      .map((s) => s.id)
      .filter((id) => serverManager.isRunning(id))
  )
  startBackupScheduler(getServers, (server) => {
    console.log(`Backup completado para "${server.name}"`)
  })
  startBuildUpdateChecker(getServers, (server, latestBuild) => {
    console.log(`Build ${latestBuild} disponible para "${server.name}"`)
  })
  startMapRenderScheduler(getServers)

  console.log('NyxLauncher (headless) listo.')
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())

main().catch((err) => {
  console.error('Fallo al arrancar NyxLauncher:', err)
  process.exit(1)
})
