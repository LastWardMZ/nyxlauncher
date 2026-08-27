// Minimal Java .properties reader/writer — good enough for server.properties
// (simple key=value lines, '#' comments, no line continuations in practice).

export function parseProperties(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('!')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim())
  }
  return map
}

/** Updates keys in-place, preserving comments/ordering/unknown keys; appends any brand-new keys at the end. */
export function updateProperties(text: string, updates: Record<string, string>): string {
  const remaining = new Map(Object.entries(updates))
  const lines = text.split(/\r?\n/)

  const nextLines = lines.map((rawLine) => {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('!')) return rawLine
    const eq = line.indexOf('=')
    if (eq === -1) return rawLine
    const key = line.slice(0, eq).trim()
    if (!remaining.has(key)) return rawLine
    const value = remaining.get(key)!
    remaining.delete(key)
    return `${key}=${value}`
  })

  for (const [key, value] of remaining) nextLines.push(`${key}=${value}`)
  return nextLines.join('\n')
}
