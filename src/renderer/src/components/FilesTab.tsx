import { useState } from 'react'
import { FileExplorer } from '@renderer/components/FileExplorer'
import { FileEditor } from '@renderer/components/FileEditor'
import type { FileEntry } from '@shared/types'

export function FilesTab({ serverId }: { serverId: string }): JSX.Element {
  const [selected, setSelected] = useState<FileEntry | null>(null)

  return (
    <div className="grid h-full grid-cols-[260px_1fr] gap-3">
      <div className="overflow-hidden rounded-lg border border-border bg-card/40">
        <FileExplorer
          serverId={serverId}
          selectedPath={selected?.relPath ?? null}
          onSelectFile={setSelected}
          onFileDeleted={(relPath) => {
            if (selected?.relPath === relPath) setSelected(null)
          }}
        />
      </div>
      <FileEditor serverId={serverId} entry={selected} />
    </div>
  )
}
