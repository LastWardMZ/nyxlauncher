import type {
  ContentDependency,
  ContentGalleryImage,
  ContentProjectDetail,
  ContentSearchHit,
  ContentSearchPage,
  ContentSearchParams,
  ContentVersion
} from '../../shared/types'
import type { ContentProviderApi } from './types'

const BASE = 'https://api.modrinth.com/v2'
const CACHE_TTL_MS = 5 * 60 * 1000
export const SEARCH_PAGE_SIZE = 20

interface ModrinthSearchHit {
  project_id: string
  slug: string
  title: string
  description: string
  author: string
  icon_url: string | null
  downloads: number
  categories: string[]
}

interface ModrinthSearchResponse {
  hits: ModrinthSearchHit[]
  total_hits: number
}

interface ModrinthVersionFile {
  filename: string
  url: string
  primary: boolean
  hashes: { sha1: string; sha512: string }
}

interface ModrinthDependency {
  project_id: string | null
  version_id: string | null
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
}

interface ModrinthVersion {
  id: string
  project_id: string
  version_number: string
  loaders: string[]
  game_versions: string[]
  date_published: string
  files: ModrinthVersionFile[]
  dependencies: ModrinthDependency[]
}

interface ModrinthGalleryImage {
  url: string
  title: string | null
  description: string | null
}

interface ModrinthProject {
  id: string
  body: string
  followers: number
  gallery: ModrinthGalleryImage[]
}

// Modrinth's stated limit is ~300 req/min, well above what a single-user desktop
// app will ever produce — a short cache just avoids re-fetching identical
// searches while someone tweaks filters, not a real rate-limit defense.
const cache = new Map<string, { data: unknown; expiresAt: number }>()

async function cachedFetchJson<T>(url: string): Promise<T> {
  const hit = cache.get(url)
  if (hit && hit.expiresAt > Date.now()) return hit.data as T
  const res = await fetch(url, { headers: { 'User-Agent': 'NyxLauncher (github.com/LastWardMZ/nyxlauncher)' } })
  if (!res.ok) throw new Error(`Modrinth ${url} -> HTTP ${res.status}`)
  const data = (await res.json()) as T
  cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}

function encodeFacets(groups: string[][]): string {
  return encodeURIComponent(JSON.stringify(groups))
}

function toDependency(d: ModrinthDependency): ContentDependency {
  return { projectId: d.project_id, versionId: d.version_id, dependencyType: d.dependency_type }
}

function toVersion(v: ModrinthVersion): ContentVersion {
  const file = v.files.find((f) => f.primary) ?? v.files[0]
  if (!file) throw new Error(`La versión ${v.version_number} de Modrinth no tiene archivos`)
  return {
    versionId: v.id,
    projectId: v.project_id,
    versionNumber: v.version_number,
    fileName: file.filename,
    url: file.url,
    sha1: file.hashes.sha1,
    loaders: v.loaders,
    gameVersions: v.game_versions,
    dependencies: v.dependencies.map(toDependency),
    datePublished: v.date_published
  }
}

async function search(params: ContentSearchParams): Promise<ContentSearchPage> {
  const groups: string[][] = [[`project_type:${params.projectType}`]]
  if (!params.ignoreCompatibility) {
    groups.push([`categories:${params.loader}`])
    groups.push([`versions:${params.mcVersion}`])
  }
  if (params.categories?.length) groups.push(params.categories.map((c) => `categories:${c}`))

  const sortParam = params.sort === 'downloads' ? 'downloads' : params.sort === 'updated' ? 'updated' : params.sort === 'newest' ? 'newest' : 'relevance'

  const url =
    `${BASE}/search?query=${encodeURIComponent(params.query)}` +
    `&facets=${encodeFacets(groups)}` +
    `&index=${sortParam}` +
    `&limit=${SEARCH_PAGE_SIZE}&offset=${params.offset ?? 0}`

  const data = await cachedFetchJson<ModrinthSearchResponse>(url)
  return {
    hits: data.hits.map(
      (h): ContentSearchHit => ({
        projectId: h.project_id,
        slug: h.slug,
        title: h.title,
        description: h.description,
        author: h.author,
        iconUrl: h.icon_url,
        downloads: h.downloads,
        categories: h.categories
      })
    ),
    totalHits: data.total_hits
  }
}

async function getVersions(
  projectId: string,
  loader: string,
  mcVersion: string,
  ignoreCompatibility?: boolean
): Promise<ContentVersion[]> {
  const params = ignoreCompatibility
    ? ''
    : `?loaders=${encodeURIComponent(JSON.stringify([loader]))}&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`
  const versions = await cachedFetchJson<ModrinthVersion[]>(`${BASE}/project/${encodeURIComponent(projectId)}/version${params}`)
  return versions.map(toVersion)
}

function toGalleryImage(g: ModrinthGalleryImage): ContentGalleryImage {
  return { url: g.url, title: g.title, description: g.description }
}

async function getProject(projectId: string): Promise<ContentProjectDetail> {
  const p = await cachedFetchJson<ModrinthProject>(`${BASE}/project/${encodeURIComponent(projectId)}`)
  return { projectId: p.id, body: p.body, followers: p.followers, gallery: p.gallery.map(toGalleryImage) }
}

export const modrinthProvider: ContentProviderApi = {
  id: 'modrinth',
  search,
  getVersions,
  getProject
}
