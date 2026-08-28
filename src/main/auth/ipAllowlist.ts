// Minimal CIDR matcher (IPv4 + IPv6) for the optional allowlist — no
// networking library exists elsewhere in this repo, and this is small enough
// not to justify adding one as a dependency.

function parseIPv4(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((p) => p > 255)) return null
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function parseIPv6(ip: string): bigint | null {
  let addr = ip
  if (addr.includes('.')) {
    // IPv4-mapped form, e.g. "::ffff:192.168.1.1" — fold the trailing IPv4
    // part into two hextets so the rest of the parser only sees IPv6 groups.
    const lastColon = addr.lastIndexOf(':')
    const v4num = parseIPv4(addr.slice(lastColon + 1))
    if (v4num === null) return null
    const hex = v4num.toString(16).padStart(8, '0')
    addr = `${addr.slice(0, lastColon + 1)}${hex.slice(0, 4)}:${hex.slice(4)}`
  }

  let head = addr
  let tail = ''
  if (addr.includes('::')) {
    const parts = addr.split('::')
    if (parts.length > 2) return null
    ;[head, tail] = parts
  } else if ((addr.match(/:/g) ?? []).length !== 7) {
    return null
  }

  const headParts = head ? head.split(':') : []
  const tailParts = tail ? tail.split(':') : []
  const missing = 8 - headParts.length - tailParts.length
  if (missing < 0) return null
  const allParts = [...headParts, ...Array(missing).fill('0'), ...tailParts]
  if (allParts.length !== 8) return null

  let value = 0n
  for (const part of allParts) {
    const n = parseInt(part === '' ? '0' : part, 16)
    if (Number.isNaN(n) || n > 0xffff || n < 0) return null
    value = (value << 16n) | BigInt(n)
  }
  return value
}

function matchesCidr(ip: string, cidr: string): boolean {
  const slashIndex = cidr.lastIndexOf('/')
  const range = slashIndex === -1 ? cidr : cidr.slice(0, slashIndex)
  const isV6 = cidr.includes(':')

  if (isV6) {
    const bits = slashIndex === -1 ? 128 : Number(cidr.slice(slashIndex + 1))
    const rangeVal = parseIPv6(range)
    const ipVal = parseIPv6(ip)
    if (rangeVal === null || ipVal === null || Number.isNaN(bits) || bits < 0 || bits > 128) return false
    const mask = bits === 0 ? 0n : (~0n << BigInt(128 - bits)) & ((1n << 128n) - 1n)
    return (rangeVal & mask) === (ipVal & mask)
  }

  const bits = slashIndex === -1 ? 32 : Number(cidr.slice(slashIndex + 1))
  const rangeVal = parseIPv4(range)
  const ipVal = parseIPv4(ip)
  if (rangeVal === null || ipVal === null || Number.isNaN(bits) || bits < 0 || bits > 32) return false
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (rangeVal & mask) === (ipVal & mask)
}

/** Empty allowlist = every IP allowed (subject to the other security layers). */
export function isIpAllowed(ip: string, allowlistCsv: string): boolean {
  const entries = allowlistCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (entries.length === 0) return true

  // ::ffff:a.b.c.d (IPv4-mapped) should match a plain IPv4 entry too.
  const unmapped = ip.replace(/^::ffff:/i, '')
  return entries.some((entry) => matchesCidr(ip, entry) || matchesCidr(unmapped, entry))
}
