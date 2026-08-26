import type { ConsoleLine } from '@shared/types'

// Matches the real, stable vanilla/Paper/Purpur server log lines
// ("Steve joined the game" / "Steve left the game"), plus a couple of
// Bukkit/Spigot fork variants seen in the wild.
const JOIN_PATTERN = /\b([A-Za-z0-9_]{3,16})\s+(?:joined the game|has joined|connected)\b/i
const LEAVE_PATTERN = /\b([A-Za-z0-9_]{3,16})\s+(?:left the game|has left|disconnected)\b/i

export function deriveConnectedPlayers(lines: ConsoleLine[]): string[] {
  const online = new Set<string>()
  for (const line of lines) {
    if (line.stream === 'system') continue
    const join = line.text.match(JOIN_PATTERN)
    if (join) {
      online.add(join[1])
      continue
    }
    const leave = line.text.match(LEAVE_PATTERN)
    if (leave) online.delete(leave[1])
  }
  return [...online].sort((a, b) => a.localeCompare(b))
}
