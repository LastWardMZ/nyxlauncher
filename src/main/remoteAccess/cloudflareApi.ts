// Thin wrapper over the Cloudflare REST API (Zone + Tunnel management),
// used only for the "domain already on Cloudflare" automatic path. Plain
// fetch() — same style as mapCliManager.ts's GitHub API calls — a handful of
// REST calls doesn't justify a full SDK dependency.

const API_BASE = 'https://api.cloudflare.com/client/v4'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cfFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.success === false) {
    const message = body?.errors?.[0]?.message ?? `HTTP ${res.status}`
    throw new Error(`Cloudflare API: ${message}`)
  }
  return body.result
}

export async function discoverAccountId(token: string): Promise<string> {
  const accounts = await cfFetch('/accounts', token)
  if (!accounts?.length) throw new Error('El token no tiene acceso a ninguna cuenta de Cloudflare')
  if (accounts.length > 1) {
    throw new Error('El token tiene acceso a varias cuentas de Cloudflare — crea uno limitado a una sola cuenta')
  }
  return accounts[0].id
}

/** `hostname` may be a subdomain (e.g. "panel.example.com") — walks up to
 *  find which registrable zone actually owns it. */
export async function resolveZoneId(token: string, hostname: string): Promise<string> {
  const labels = hostname.split('.')
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join('.')
    const zones = await cfFetch(`/zones?name=${encodeURIComponent(candidate)}`, token)
    if (zones?.length) return zones[0].id
  }
  throw new Error(`No se encontró en Cloudflare una zona que sea dueña de "${hostname}" con este token`)
}

export async function createTunnel(token: string, accountId: string, name: string): Promise<{ id: string; runToken: string }> {
  const result = await cfFetch(`/accounts/${accountId}/cfd_tunnel`, token, {
    method: 'POST',
    body: JSON.stringify({ name, config_src: 'cloudflare' })
  })
  return { id: result.id, runToken: result.token }
}

export async function configureIngress(token: string, accountId: string, tunnelId: string, hostname: string, localPort: number): Promise<void> {
  await cfFetch(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, token, {
    method: 'PUT',
    body: JSON.stringify({
      config: {
        ingress: [{ hostname, service: `http://127.0.0.1:${localPort}` }, { service: 'http_status:404' }]
      }
    })
  })
}

export async function createOrUpdateDnsRecord(token: string, zoneId: string, hostname: string, tunnelId: string): Promise<void> {
  const target = `${tunnelId}.cfargotunnel.com`
  const existing = await cfFetch(`/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`, token)
  if (existing?.length) {
    await cfFetch(`/zones/${zoneId}/dns_records/${existing[0].id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ content: target, proxied: true })
    })
    return
  }
  await cfFetch(`/zones/${zoneId}/dns_records`, token, {
    method: 'POST',
    body: JSON.stringify({ type: 'CNAME', name: hostname, content: target, proxied: true })
  })
}

export async function deleteTunnel(token: string, accountId: string, tunnelId: string): Promise<void> {
  await cfFetch(`/accounts/${accountId}/cfd_tunnel/${tunnelId}?cascade=true`, token, { method: 'DELETE' }).catch(() => {
    // Best-effort — if it's already gone (e.g. deleted from the dashboard), don't block disconnecting locally.
  })
}
