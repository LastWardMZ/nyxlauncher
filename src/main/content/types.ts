import type { ContentProjectDetail, ContentSearchParams, ContentSearchPage, ContentVersion } from '../../shared/types'

/**
 * What every content source (Modrinth today, CurseForge later behind the flag
 * in providers.ts) has to implement. contentManager.ts owns everything that's
 * the same regardless of source — dependency resolution, hash verification,
 * writing installed_content.json — so a second provider only has to talk to
 * its own API.
 */
export interface ContentProviderApi {
  id: 'modrinth' | 'curseforge'
  search(params: ContentSearchParams): Promise<ContentSearchPage>
  getVersions(projectId: string, loader: string, mcVersion: string, ignoreCompatibility?: boolean): Promise<ContentVersion[]>
  getProject(projectId: string): Promise<ContentProjectDetail>
}
