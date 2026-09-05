import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Users
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Badge } from '@renderer/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@renderer/components/ui/dialog'
import { FLAVOR_CONTENT_TYPE, FLAVOR_TO_LOADER } from '@shared/types'
import type { ContentProjectDetail, ContentSearchHit, InstalledContentEntry, ServerConfig } from '@shared/types'

// Mirrors src/main/content/modrinthProvider.ts's SEARCH_PAGE_SIZE — the renderer
// can't import from the main process, so this is kept in sync by hand.
const SEARCH_PAGE_SIZE = 20

// Modrinth READMEs routinely embed raw HTML (centered banner images, <br>, <i>)
// right inside the markdown — without rehype-raw that shows up as literal,
// escaped source text instead of being rendered. rehype-sanitize then strips
// anything actually dangerous (scripts, event handlers, javascript: hrefs)
// since this is third-party content; the extra attributes below are just the
// harmless layout ones (align/width/height) READMEs commonly rely on.
const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'center'],
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), 'width', 'height', 'align'],
    p: [...(defaultSchema.attributes?.p ?? []), 'align'],
    div: [...(defaultSchema.attributes?.div ?? []), 'align']
  }
}

export function ContentTab({ server }: { server: ServerConfig }): JSX.Element {
  const loader = FLAVOR_TO_LOADER[server.flavor]
  const contentType = FLAVOR_CONTENT_TYPE[server.flavor]

  if (!loader || !contentType) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 opacity-40" />
        <div>
          <p className="text-sm">
            {server.flavor === 'vanilla'
              ? 'Vanilla no soporta plugins ni mods.'
              : 'Este tipo de servidor no tiene gestor de contenido integrado.'}
          </p>
          <p className="mt-1 text-xs">Instala Paper/Purpur/Folia para plugins, o Fabric/Forge/NeoForge para mods.</p>
        </div>
      </div>
    )
  }

  return <ContentTabSupported server={server} loader={loader} contentType={contentType} />
}

function ContentTabSupported({
  server,
  loader,
  contentType
}: {
  server: ServerConfig
  loader: string
  contentType: 'mod' | 'plugin'
}): JSX.Element {
  const [mcVersionOverride, setMcVersionOverride] = useState('')
  const mcVersion = server.installedBuild?.version || mcVersionOverride

  if (!mcVersion) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Package className="h-8 w-8 text-muted-foreground opacity-40" />
        <div>
          <p className="text-sm">No sabemos qué versión de Minecraft usa este servidor.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pasa si añadiste el .jar a mano. Escribe la versión para poder buscar contenido compatible.
          </p>
        </div>
        <Input
          placeholder="ej. 1.21.11"
          className="max-w-[200px] text-center"
          onKeyDown={(e) => {
            if (e.key === 'Enter') setMcVersionOverride((e.target as HTMLInputElement).value.trim())
          }}
          onBlur={(e) => setMcVersionOverride(e.target.value.trim())}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {contentType === 'mod' && <ModpackInstall server={server} />}
      <Tabs defaultValue="search" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="search">Buscar</TabsTrigger>
          {contentType === 'mod' && <TabsTrigger value="modpacks">Modpacks</TabsTrigger>}
          <TabsTrigger value="installed">Instalados</TabsTrigger>
        </TabsList>
        <TabsContent
          value="search"
          className="min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
        >
          <SearchView server={server} loader={loader} contentType={contentType} mcVersion={mcVersion} />
        </TabsContent>
        {contentType === 'mod' && (
          <TabsContent
            value="modpacks"
            className="min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
          >
            <ModpackSearchView server={server} loader={loader} mcVersion={mcVersion} />
          </TabsContent>
        )}
        <TabsContent
          value="installed"
          className="min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
        >
          <InstalledView server={server} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ModpackInstall({ server }: { server: ServerConfig }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function install(): Promise<void> {
    const zipPath = await window.launcher.dialogs.pickFile([{ name: 'Modpack (.mrpack)', extensions: ['mrpack', 'zip'] }])
    if (!zipPath) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.launcher.content.installModpack(server.id, zipPath)
      setMessage(
        result.success
          ? `Modpack instalado: ${result.installed.length} archivos.`
          : (result.error ?? 'La instalación falló.')
      )
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-medium">Instalar modpack</p>
        <p className="truncate text-[11px] text-muted-foreground">{message ?? 'Sube un .mrpack de Modrinth con los mods y overrides ya empaquetados.'}</p>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={busy} onClick={install}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Elegir .mrpack
      </Button>
    </div>
  )
}

function SearchView({
  server,
  loader,
  contentType,
  mcVersion
}: {
  server: ServerConfig
  loader: string
  contentType: 'mod' | 'plugin'
  mcVersion: string
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'relevance' | 'downloads' | 'updated'>('relevance')
  const [advanced, setAdvanced] = useState(false)
  const [hits, setHits] = useState<ContentSearchHit[]>([])
  const [totalHits, setTotalHits] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installProgress, setInstallProgress] = useState<{ downloaded: number; total: number | null } | null>(null)
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [detailHit, setDetailHit] = useState<ContentSearchHit | null>(null)

  useEffect(() => {
    window.launcher.content.listInstalled(server.id).then((entries) => setInstalledIds(new Set(entries.map((e) => e.projectId))))
  }, [server.id])

  async function runSearch(atPage: number): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const page = await window.launcher.content.search('modrinth', {
        query,
        projectType: contentType,
        loader,
        mcVersion,
        sort,
        ignoreCompatibility: advanced,
        offset: atPage * SEARCH_PAGE_SIZE
      })
      setHits(page.hits)
      setTotalHits(page.totalHits)
      setPageIndex(atPage)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void runSearch(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, advanced])

  const totalPages = Math.max(1, Math.ceil(totalHits / SEARCH_PAGE_SIZE))

  useEffect(() => {
    const offProgress = window.launcher.events.onContentProgress((p) => {
      setInstallProgress({ downloaded: p.downloadedBytes, total: p.totalBytes })
    })
    const offDone = window.launcher.events.onContentDone((r) => {
      setInstallingId(null)
      setInstallProgress(null)
      if (r.success) {
        setInstalledIds((prev) => new Set([...prev, ...r.installed.map((i) => i.projectId)]))
      } else {
        setError(r.error)
      }
    })
    return () => {
      offProgress()
      offDone()
    }
  }, [])

  async function install(hit: ContentSearchHit): Promise<void> {
    setInstallingId(hit.projectId)
    setInstallProgress({ downloaded: 0, total: null })
    setError(null)
    await window.launcher.content.install(server.id, 'modrinth', hit.projectId, hit.title, 'latest', advanced)
  }

  const progressPct =
    installProgress?.total && installProgress.total > 0 ? Math.min(100, Math.round((installProgress.downloaded / installProgress.total) * 100)) : null

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch(0)}
            placeholder={contentType === 'plugin' ? 'Buscar plugins...' : 'Buscar mods...'}
            className="pl-8"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Relevancia</SelectItem>
            <SelectItem value="downloads">Descargas</SelectItem>
            <SelectItem value="updated">Actualizado</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => runSearch(0)} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Buscar'}
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2">
        <div>
          <Label htmlFor="advanced" className="cursor-pointer text-xs">
            Modo avanzado
          </Label>
          <p className="text-[11px] text-muted-foreground">Muestra resultados aunque no coincidan con {loader} {mcVersion}.</p>
        </div>
        <Switch id="advanced" checked={advanced} onCheckedChange={setAdvanced} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
        {hits.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados</p>
        )}
        {hits.map((hit) => (
          <div
            key={hit.projectId}
            role="button"
            tabIndex={0}
            onClick={() => setDetailHit(hit)}
            onKeyDown={(e) => e.key === 'Enter' && setDetailHit(hit)}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/20"
          >
            {hit.iconUrl ? (
              <img src={hit.iconUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/40">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{hit.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {hit.author} · {hit.downloads.toLocaleString()} descargas
              </p>
            </div>
            {installedIds.has(hit.projectId) ? (
              <Badge variant="success">Instalado</Badge>
            ) : installingId === hit.projectId ? (
              <Badge variant="secondary" className="gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> {progressPct !== null ? `${progressPct}%` : '...'}
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={(e) => {
                  e.stopPropagation()
                  install(hit)
                }}
              >
                <Download className="h-3.5 w-3.5" /> Instalar
              </Button>
            )}
          </div>
        ))}
      </div>

      {totalHits > SEARCH_PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-border/60 pt-2">
          <Button size="sm" variant="ghost" disabled={loading || pageIndex === 0} onClick={() => runSearch(pageIndex - 1)} className="gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {pageIndex + 1} de {totalPages} · {totalHits.toLocaleString()} resultados
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={loading || pageIndex + 1 >= totalPages}
            onClick={() => runSearch(pageIndex + 1)}
            className="gap-1"
          >
            Siguiente <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {detailHit && (
        <ProjectDetailDialog
          hit={detailHit}
          onOpenChange={(open) => !open && setDetailHit(null)}
          installed={installedIds.has(detailHit.projectId)}
          installing={installingId === detailHit.projectId}
          progressPct={progressPct}
          onInstall={() => install(detailHit)}
        />
      )}
    </div>
  )
}

function ModpackSearchView({
  server,
  loader,
  mcVersion
}: {
  server: ServerConfig
  loader: string
  mcVersion: string
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'relevance' | 'downloads' | 'updated'>('relevance')
  const [advanced, setAdvanced] = useState(false)
  const [hits, setHits] = useState<ContentSearchHit[]>([])
  const [totalHits, setTotalHits] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installProgress, setInstallProgress] = useState<{ downloaded: number; total: number | null } | null>(null)
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [detailHit, setDetailHit] = useState<ContentSearchHit | null>(null)

  async function runSearch(atPage: number): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const page = await window.launcher.content.search('modrinth', {
        query,
        projectType: 'modpack',
        loader,
        mcVersion,
        sort,
        ignoreCompatibility: advanced,
        offset: atPage * SEARCH_PAGE_SIZE
      })
      setHits(page.hits)
      setTotalHits(page.totalHits)
      setPageIndex(atPage)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void runSearch(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, advanced])

  const totalPages = Math.max(1, Math.ceil(totalHits / SEARCH_PAGE_SIZE))

  useEffect(() => {
    const offProgress = window.launcher.events.onContentProgress((p) => {
      setInstallProgress({ downloaded: p.downloadedBytes, total: p.totalBytes })
    })
    const offDone = window.launcher.events.onContentDone((r) => {
      setInstallingId((current) => {
        if (current && r.success) setInstalledIds((prev) => new Set([...prev, current]))
        return null
      })
      setInstallProgress(null)
      if (!r.success) setError(r.error)
    })
    return () => {
      offProgress()
      offDone()
    }
  }, [])

  async function install(hit: ContentSearchHit): Promise<void> {
    setInstallingId(hit.projectId)
    setInstallProgress({ downloaded: 0, total: null })
    setError(null)
    await window.launcher.content.installModpackFromProvider(server.id, 'modrinth', hit.projectId, hit.title, 'latest', advanced)
  }

  const progressPct =
    installProgress?.total && installProgress.total > 0 ? Math.min(100, Math.round((installProgress.downloaded / installProgress.total) * 100)) : null

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch(0)}
            placeholder="Buscar modpacks..."
            className="pl-8"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Relevancia</SelectItem>
            <SelectItem value="downloads">Descargas</SelectItem>
            <SelectItem value="updated">Actualizado</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => runSearch(0)} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Buscar'}
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2">
        <div>
          <Label htmlFor="advanced-modpacks" className="cursor-pointer text-xs">
            Modo avanzado
          </Label>
          <p className="text-[11px] text-muted-foreground">Muestra resultados aunque no coincidan con {loader} {mcVersion}.</p>
        </div>
        <Switch id="advanced-modpacks" checked={advanced} onCheckedChange={setAdvanced} />
      </div>

      <p className="text-[11px] text-muted-foreground">
        Instalar un modpack añade sus mods y su configuración a este servidor — puede sobrescribir archivos existentes.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
        {hits.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados</p>
        )}
        {hits.map((hit) => (
          <div
            key={hit.projectId}
            role="button"
            tabIndex={0}
            onClick={() => setDetailHit(hit)}
            onKeyDown={(e) => e.key === 'Enter' && setDetailHit(hit)}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/20"
          >
            {hit.iconUrl ? (
              <img src={hit.iconUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/40">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{hit.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {hit.author} · {hit.downloads.toLocaleString()} descargas
              </p>
            </div>
            {installedIds.has(hit.projectId) ? (
              <Badge variant="success">Instalado</Badge>
            ) : installingId === hit.projectId ? (
              <Badge variant="secondary" className="gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> {progressPct !== null ? `${progressPct}%` : '...'}
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={(e) => {
                  e.stopPropagation()
                  install(hit)
                }}
              >
                <Download className="h-3.5 w-3.5" /> Instalar
              </Button>
            )}
          </div>
        ))}
      </div>

      {totalHits > SEARCH_PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-border/60 pt-2">
          <Button size="sm" variant="ghost" disabled={loading || pageIndex === 0} onClick={() => runSearch(pageIndex - 1)} className="gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {pageIndex + 1} de {totalPages} · {totalHits.toLocaleString()} resultados
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={loading || pageIndex + 1 >= totalPages}
            onClick={() => runSearch(pageIndex + 1)}
            className="gap-1"
          >
            Siguiente <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {detailHit && (
        <ProjectDetailDialog
          hit={detailHit}
          onOpenChange={(open) => !open && setDetailHit(null)}
          installed={installedIds.has(detailHit.projectId)}
          installing={installingId === detailHit.projectId}
          progressPct={progressPct}
          onInstall={() => install(detailHit)}
        />
      )}
    </div>
  )
}

function ProjectDetailDialog({
  hit,
  onOpenChange,
  installed,
  installing,
  progressPct,
  onInstall
}: {
  hit: ContentSearchHit
  onOpenChange: (open: boolean) => void
  installed: boolean
  installing: boolean
  progressPct: number | null
  onInstall: () => void
}): JSX.Element {
  const [detail, setDetail] = useState<ContentProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    window.launcher.content
      .getProject('modrinth', hit.projectId)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [hit.projectId])

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            {hit.iconUrl ? (
              <img src={hit.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/40">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            {hit.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{hit.author}</span>
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" /> {hit.downloads.toLocaleString()}
            </span>
            {detail && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {detail.followers.toLocaleString()}
              </span>
            )}
            <a
              href={`https://modrinth.com/project/${hit.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Ver en Modrinth
            </a>
          </div>

          {hit.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hit.categories.map((c) => (
                <Badge key={c} variant="outline">
                  {c}
                </Badge>
              ))}
            </div>
          )}

          {detail && detail.gallery.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {detail.gallery.map((g) => (
                <img key={g.url} src={g.url} alt={g.title ?? ''} className="h-24 shrink-0 rounded-md object-cover" />
              ))}
            </div>
          )}

          <div className="max-h-[28rem] overflow-y-auto scrollbar-thin rounded-md border border-border/60 bg-muted/10 p-4 text-sm">
            {loading ? (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando...
              </p>
            ) : error ? (
              <p className="text-destructive">{error}</p>
            ) : (
              <div className="prose prose-sm prose-invert max-w-none prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-code:text-foreground prose-th:text-foreground">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw, [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]]}
                  components={{
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noreferrer">
                        {children}
                      </a>
                    )
                  }}
                >
                  {detail?.body || hit.description}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {installed ? (
            <Badge variant="success">Instalado</Badge>
          ) : (
            <Button className="gap-1.5" disabled={installing} onClick={onInstall}>
              {installing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progressPct !== null ? `${progressPct}%` : 'Instalando...'}
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" /> Instalar
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InstalledView({ server }: { server: ServerConfig }): JSX.Element {
  const [entries, setEntries] = useState<InstalledContentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function load(): Promise<void> {
    setLoading(true)
    try {
      setEntries(await window.launcher.content.listInstalled(server.id))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id])

  async function updateOne(projectId: string): Promise<void> {
    setBusyId(projectId)
    setMessage(null)
    try {
      const updated = await window.launcher.content.update(server.id, 'modrinth', projectId)
      setMessage(updated ? `Actualizado a ${updated.versionNumber}` : 'Ya estaba en la última versión')
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  async function updateAll(): Promise<void> {
    setBusyId('*all*')
    setMessage(null)
    let count = 0
    for (const entry of entries.filter((e) => !e.isDependency)) {
      try {
        const updated = await window.launcher.content.update(server.id, 'modrinth', entry.projectId)
        if (updated) count++
      } catch {
        // keep going with the rest
      }
    }
    setMessage(count > 0 ? `${count} actualizados` : 'Todo estaba ya actualizado')
    setBusyId(null)
    await load()
  }

  async function uninstall(projectId: string): Promise<void> {
    setBusyId(projectId)
    try {
      await window.launcher.content.uninstall(server.id, projectId)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando...</div>
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{entries.length} instalados</p>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={busyId !== null || entries.length === 0} onClick={updateAll}>
          {busyId === '*all*' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Actualizar todo
        </Button>
      </div>

      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
        {entries.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nada instalado todavía</p>}
        {entries.map((entry) => (
          <div
            key={entry.projectId}
            className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {entry.title} {entry.isDependency && <span className="text-[10px] text-muted-foreground">(dependencia)</span>}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">{entry.versionNumber}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              disabled={busyId !== null}
              onClick={() => updateOne(entry.projectId)}
              title="Buscar actualización"
            >
              {busyId === entry.projectId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={busyId !== null}
              onClick={() => uninstall(entry.projectId)}
              title="Desinstalar"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
