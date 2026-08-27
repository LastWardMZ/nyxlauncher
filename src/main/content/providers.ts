import { modrinthProvider } from './modrinthProvider'
import { curseforgeProvider } from './curseforgeProvider'
import type { ContentProviderApi } from './types'
import type { ContentProvider } from '../../shared/types'

/** Flip once CurseForge support (and its paid API key handling) actually exists. */
const CURSEFORGE_ENABLED = false

const providers: Record<ContentProvider, ContentProviderApi> = {
  modrinth: modrinthProvider,
  curseforge: curseforgeProvider
}

export function getProvider(id: ContentProvider): ContentProviderApi {
  if (id === 'curseforge' && !CURSEFORGE_ENABLED) {
    throw new Error('CurseForge no está disponible todavía')
  }
  return providers[id]
}
