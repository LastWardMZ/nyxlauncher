import type { ContentProviderApi } from './types'

// Registered but off (see providers.ts) until CurseForge support is actually
// built — it needs a paid API key, unlike Modrinth. Exists now purely so the
// ContentProviderApi interface has a second implementer to keep it honest.
const notImplemented = (): never => {
  throw new Error('CurseForge no está disponible todavía')
}

export const curseforgeProvider: ContentProviderApi = {
  id: 'curseforge',
  search: notImplemented,
  getVersions: notImplemented,
  getProject: notImplemented
}
