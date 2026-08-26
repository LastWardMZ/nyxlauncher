import type { ConsoleLine } from '@shared/types'

// Vanilla/Paper/Purpur all print this exact line (it's been stable Mojang
// wording for years) when eula.txt is missing or still says eula=false.
const EULA_PATTERN = /you need to agree to the eula/i

export function consoleIndicatesEulaNeeded(lines: ConsoleLine[]): boolean {
  return lines.some((l) => EULA_PATTERN.test(l.text))
}
