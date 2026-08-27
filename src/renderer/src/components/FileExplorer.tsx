import { useCallback, useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Download,
  File as FileIcon,
  FileJson,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
  Upload
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { cn } from '@renderer/lib/utils'
import type { FileEntry } from '@shared/types'

interface FileExplorerProps {
  serverId: string
  selectedPath: string | null
  onSelectFile: (entry: FileEntry) => void
  onFileDeleted: (relPath: string) => void
}

interface NodeState {
  entries: FileEntry[]
  loading: boolean
}

export function FileExplorer({ serverId, selectedPath, onSelectFile, onFileDeleted }: FileExplorerProps): JSX.Element {
  const [nodes, setNodes] = useState<Record<string, NodeState>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null)
  const [renaming, setRenaming] = useState<FileEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const loadDir = useCallback(
    async (relDir: string) => {
      setNodes((prev) => ({ ...prev, [relDir]: { entries: prev[relDir]?.entries ?? [], loading: true } }))
      const entries = await window.launcher.files.list(serverId, relDir)
      setNodes((prev) => ({ ...prev, [relDir]: { entries, loading: false } }))
    },
    [serverId]
  )

  useEffect(() => {
    void loadDir('')
  }, [loadDir])

  function toggle(relPath: string): void {
    // Side effects (loadDir, which itself calls setState) must not live inside
    // the setExpanded updater — React can invoke that callback more than once
    // per call (it does this internally to bail out early when the resulting
    // state is unchanged), and each invocation reads `nodes` from this render's
    // stale closure. Re-running loadDir() on every extra invocation kept
    // kicking off new state updates that triggered more re-invocations, which
    // is exactly the loop that froze the renderer when expanding a folder.
    const opening = !expanded.has(relPath)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (opening) next.add(relPath)
      else next.delete(relPath)
      return next
    })
    if (opening && !nodes[relPath]) void loadDir(relPath)
  }

  async function handleNewFile(): Promise<void> {
    const name = window.prompt('Nombre del nuevo archivo:')
    if (!name) return
    await window.launcher.files.createFile(serverId, name)
    await loadDir('')
  }

  async function handleNewFolder(): Promise<void> {
    const name = window.prompt('Nombre de la nueva carpeta:')
    if (!name) return
    await window.launcher.files.createDirectory(serverId, name)
    await loadDir('')
  }

  async function handleUpload(): Promise<void> {
    const count = await window.launcher.files.import(serverId, '')
    if (count > 0) await loadDir('')
  }

  async function handleDelete(entry: FileEntry): Promise<void> {
    await window.launcher.files.remove(serverId, entry.relPath)
    onFileDeleted(entry.relPath)
    const parent = parentOf(entry.relPath)
    await loadDir(parent)
  }

  async function handleRenameSubmit(): Promise<void> {
    if (!renaming || !renameValue.trim() || renameValue === renaming.name) {
      setRenaming(null)
      return
    }
    const parent = parentOf(renaming.relPath)
    const toRelPath = parent ? `${parent}/${renameValue.trim()}` : renameValue.trim()
    await window.launcher.files.rename(serverId, renaming.relPath, toRelPath)
    setRenaming(null)
    await loadDir(parent)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <IconButton title="Nuevo archivo" onClick={handleNewFile} icon={<FileIcon className="h-3.5 w-3.5" />} />
        <IconButton title="Nueva carpeta" onClick={handleNewFolder} icon={<FolderPlus className="h-3.5 w-3.5" />} />
        <IconButton title="Subir archivos" onClick={handleUpload} icon={<Upload className="h-3.5 w-3.5" />} />
        <IconButton title="Refrescar" onClick={() => loadDir('')} icon={<RefreshCw className="h-3.5 w-3.5" />} />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        <TreeLevel
          relDir=""
          depth={0}
          node={nodes['']}
          expanded={expanded}
          nodes={nodes}
          selectedPath={selectedPath}
          onToggle={toggle}
          onSelectFile={onSelectFile}
          onRequestDelete={setPendingDelete}
          onRequestRename={(entry) => {
            setRenaming(entry)
            setRenameValue(entry.name)
          }}
          onRequestExport={(entry) => window.launcher.files.export(serverId, entry.relPath)}
        />
      </div>

      {renaming && (
        <div className="border-t border-border p-2">
          <p className="mb-1 text-xs text-muted-foreground">Renombrar "{renaming.name}"</p>
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRenameSubmit()
                if (e.key === 'Escape') setRenaming(null)
              }}
              className="h-7 flex-1 rounded-md border border-input bg-muted/30 px-2 text-xs"
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={handleRenameSubmit}>
              OK
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`¿Eliminar "${pendingDelete?.name}"?`}
        description={
          pendingDelete?.isDirectory
            ? 'Se eliminará la carpeta y todo su contenido de forma permanente.'
            : 'Se eliminará el archivo de forma permanente.'
        }
        confirmLabel="Eliminar"
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
      />
    </div>
  )
}

function parentOf(relPath: string): string {
  const idx = relPath.lastIndexOf('/')
  return idx === -1 ? '' : relPath.slice(0, idx)
}

function IconButton({
  icon,
  title,
  onClick
}: {
  icon: React.ReactNode
  title: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {icon}
    </button>
  )
}

interface TreeLevelProps {
  relDir: string
  depth: number
  node: NodeState | undefined
  expanded: Set<string>
  nodes: Record<string, NodeState>
  selectedPath: string | null
  onToggle: (relPath: string) => void
  onSelectFile: (entry: FileEntry) => void
  onRequestDelete: (entry: FileEntry) => void
  onRequestRename: (entry: FileEntry) => void
  onRequestExport: (entry: FileEntry) => void
}

function TreeLevel(props: TreeLevelProps): JSX.Element {
  const { node } = props
  if (!node) return <></>
  if (node.entries.length === 0 && !node.loading) {
    return props.depth === 0 ? (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">Carpeta vacía</p>
    ) : (
      <></>
    )
  }
  return (
    <>
      {node.entries.map((entry) => (
        <TreeRow key={entry.relPath} entry={entry} {...props} />
      ))}
    </>
  )
}

function TreeRow(props: TreeLevelProps & { entry: FileEntry }): JSX.Element {
  // `entry` must never end up inside `rest`: TreeLevel spreads its props onto every
  // child TreeRow with `entry={childEntry} {...props}`, so if `rest` still carried this
  // row's own `entry`, that spread would silently overwrite each child's `entry` with
  // this row's — locking every descendant onto this row's relPath and re-expanding the
  // exact same subtree forever (this is what produced the infinite recursive render/freeze
  // when a folder with subfolders, like "libraries", was expanded).
  const { entry, ...rest } = props
  const { depth, expanded, nodes, selectedPath } = rest
  const isOpen = expanded.has(entry.relPath)
  const isSelected = selectedPath === entry.relPath

  return (
    <div>
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted/50',
          isSelected && 'bg-primary/12 text-primary'
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => (entry.isDirectory ? props.onToggle(entry.relPath) : props.onSelectFile(entry))}
      >
        {entry.isDirectory ? (
          isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {entry.isDirectory ? (
          isOpen ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-secondary" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-secondary" />
          )
        ) : entry.name.endsWith('.json') ? (
          <FileJson className="h-3.5 w-3.5 shrink-0 text-accent" />
        ) : (
          <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate">{entry.name}</span>
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <RowAction
            title="Descargar"
            icon={<Download className="h-3 w-3" />}
            onClick={(e) => {
              e.stopPropagation()
              props.onRequestExport(entry)
            }}
          />
          <RowAction
            title="Renombrar"
            icon={<Pencil className="h-3 w-3" />}
            onClick={(e) => {
              e.stopPropagation()
              props.onRequestRename(entry)
            }}
          />
          <RowAction
            title="Eliminar"
            icon={<Trash2 className="h-3 w-3" />}
            danger
            onClick={(e) => {
              e.stopPropagation()
              props.onRequestDelete(entry)
            }}
          />
        </span>
      </div>
      {entry.isDirectory && isOpen && (
        <TreeLevel {...rest} relDir={entry.relPath} depth={depth + 1} node={nodes[entry.relPath]} />
      )}
    </div>
  )
}

function RowAction({
  icon,
  title,
  danger,
  onClick
}: {
  icon: React.ReactNode
  title: string
  danger?: boolean
  onClick: (e: React.MouseEvent) => void
}): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'rounded p-1 text-muted-foreground hover:bg-muted',
        danger ? 'hover:text-destructive' : 'hover:text-foreground'
      )}
    >
      {icon}
    </button>
  )
}
