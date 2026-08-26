import { promises as fs } from 'fs'
import { join } from 'path'
import { parse, stringify } from 'smol-toml'
import type { ProxyBackendEntry, ProxyConfigResult } from '../shared/types'

const VELOCITY_TOML = 'velocity.toml'

const DEFAULT_VELOCITY_TOML = `config-version = "2.7"
bind = "0.0.0.0:25577"
motd = "<#09add3>A Velocity Server"
show-max-players = 500
online-mode = true
force-key-authentication = true
prevent-client-proxy-connections = false
player-info-forwarding-mode = "NONE"
forwarding-secret-file = "forwarding.secret"
announce-forge = false
kick-existing-players = false
ping-passthrough = "DISABLED"
sample-players-in-ping = false
enable-player-address-logging = true

[servers]
try = []

[forced-hosts]

[advanced]
compression-threshold = 256
compression-level = -1
login-ratelimit = 3000
connection-timeout = 5000
read-timeout = 30000
haproxy-protocol = false
tcp-fast-open = false
bungee-plugin-message-channel = true
show-ping-requests = false
failover-on-unexpected-server-disconnect = true
announce-proxy-commands = true
log-command-executions = false
log-player-connections = true
accepts-transfers = false
enable-reuse-port = false

[query]
enabled = false
port = 25577
map = "Velocity"
show-plugins = false
`

/** Reads the `[servers]` table and `try` list from velocity.toml, if it exists. */
export async function readProxyConfig(workingDirectory: string): Promise<ProxyConfigResult> {
  const path = join(workingDirectory, VELOCITY_TOML)
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch {
    return { exists: false, servers: [], tryOrder: [] }
  }

  const doc = parse(raw) as Record<string, unknown>
  const serversTable = (doc.servers as Record<string, unknown>) ?? {}
  const servers: ProxyBackendEntry[] = Object.entries(serversTable)
    .filter(([key, value]) => key !== 'try' && typeof value === 'string')
    .map(([name, address]) => ({ name, address: address as string }))
  const tryOrder = Array.isArray(serversTable.try) ? (serversTable.try as string[]) : []

  return { exists: true, servers, tryOrder }
}

/** Writes back the `[servers]` table + `try` list, preserving every other key in the file (or creating a sensible default velocity.toml if none exists yet). */
export async function writeProxyConfig(
  workingDirectory: string,
  servers: ProxyBackendEntry[],
  tryOrder: string[]
): Promise<void> {
  const path = join(workingDirectory, VELOCITY_TOML)
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch {
    raw = DEFAULT_VELOCITY_TOML
  }

  const doc = parse(raw) as Record<string, unknown>
  const serversTable: Record<string, unknown> = {}
  for (const s of servers) serversTable[s.name] = s.address
  serversTable.try = tryOrder
  doc.servers = serversTable

  await fs.writeFile(path, stringify(doc), 'utf8')
}
