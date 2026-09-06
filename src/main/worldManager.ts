import { promises as fs } from 'fs'
import { join } from 'path'
import { safeResolve } from './fileManagerCore'
import { parseProperties, updateProperties } from '../shared/propertiesFile'
import type { ServerConfig, WorldInfo } from '../shared/types'

async function hasLevelDat(dirAbs: string): Promise<boolean> {
  try {
    await fs.access(join(dirAbs, 'level.dat'))
    return true
  } catch {
    return false
  }
}

export async function getActiveLevelName(server: ServerConfig): Promise<string> {
  try {
    const propsPath = safeResolve(server.workingDirectory, server.configFilePath)
    const text = await fs.readFile(propsPath, 'utf8')
    return parseProperties(text).get('level-name')?.trim() || 'world'
  } catch {
    return 'world'
  }
}

/** Every folder with a level.dat is a real save, but Paper/Purpur split the
 *  nether/end into <name>_nether/<name>_the_end siblings that share the same
 *  logical world — fold those into their base entry instead of listing three
 *  separately-switchable "worlds" for what is really one. */
export async function listWorlds(server: ServerConfig): Promise<WorldInfo[]> {
  let dirNames: string[]
  try {
    dirNames = (await fs.readdir(server.workingDirectory, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }

  const withLevelDat = new Set<string>()
  await Promise.all(
    dirNames.map(async (name) => {
      if (await hasLevelDat(join(server.workingDirectory, name))) withLevelDat.add(name)
    })
  )

  const active = await getActiveLevelName(server)
  const bases = new Set<string>()
  for (const name of withLevelDat) {
    if (name.endsWith('_nether') && withLevelDat.has(name.slice(0, -'_nether'.length))) continue
    if (name.endsWith('_the_end') && withLevelDat.has(name.slice(0, -'_the_end'.length))) continue
    bases.add(name)
  }

  return [...bases]
    .sort((a, b) => (a === active ? -1 : b === active ? 1 : a.localeCompare(b)))
    .map((name) => ({
      name,
      isActive: name === active,
      hasNether: withLevelDat.has(`${name}_nether`),
      hasEnd: withLevelDat.has(`${name}_the_end`)
    }))
}

export async function setActiveWorld(server: ServerConfig, worldName: string): Promise<void> {
  const propsPath = safeResolve(server.workingDirectory, server.configFilePath)
  const text = await fs.readFile(propsPath, 'utf8').catch(() => '')
  await fs.writeFile(propsPath, updateProperties(text, { 'level-name': worldName }), 'utf8')
}

export async function deleteWorld(server: ServerConfig, worldName: string): Promise<void> {
  const active = await getActiveLevelName(server)
  if (worldName === active) throw new Error('No se puede eliminar el mundo activo — activa otro primero.')

  await fs.rm(safeResolve(server.workingDirectory, worldName), { recursive: true, force: true })
  await fs.rm(safeResolve(server.workingDirectory, `${worldName}_nether`), { recursive: true, force: true })
  await fs.rm(safeResolve(server.workingDirectory, `${worldName}_the_end`), { recursive: true, force: true })
}
