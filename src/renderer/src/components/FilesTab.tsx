import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { FileExplorer } from '@renderer/components/FileExplorer'
import { FileEditor } from '@renderer/components/FileEditor'
import { cn } from '@renderer/lib/utils'
import type { FileEntry } from '@shared/types'

export function FilesTab({ serverId }: { serverId: string }): JSX.Element {
  const [selected, setSelected] = useState<FileEntry | null>(null)

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-hidden sm:grid-cols-[260px_1fr]">
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-border bg-card/40',
          selected && 'hidden sm:block'
        )}
      >
        <FileExplorer
          serverId={serverId}
          selectedPath={selected?.relPath ?? null}
          onSelectFile={setSelected}
          onFileDeleted={(relPath) => {
            if (selected?.relPath === relPath) setSelected(null)
          }}
        />
      </div>
      <div className={cn('flex min-h-0 flex-col gap-2', !selected && 'hidden sm:flex')}>
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-foreground sm:hidden"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al explorador
        </button>
        <div className="min-h-0 flex-1">
          <FileEditor serverId={serverId} entry={selected} />
        </div>
      </div>
    </div>
  )
}
