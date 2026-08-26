import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { AlertTriangle, FileWarning, Save } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { languageForFile, isLikelyTextFile } from '@renderer/lib/fileLanguage'
import type { FileEntry } from '@shared/types'

interface FileEditorProps {
  serverId: string
  entry: FileEntry | null
}

export function FileEditor({ serverId, entry }: FileEditorProps): JSX.Element {
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entry || entry.isDirectory) return
    if (!isLikelyTextFile(entry.name)) return

    let cancelled = false
    setLoading(true)
    setError(null)
    window.launcher.files
      .readText(serverId, entry.relPath)
      .then((result) => {
        if (cancelled) return
        setContent(result?.content ?? '')
        setOriginalContent(result?.content ?? '')
        setTruncated(result?.truncated ?? false)
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [serverId, entry?.relPath])

  async function handleSave(): Promise<void> {
    if (!entry) return
    setSaving(true)
    setError(null)
    try {
      await window.launcher.files.writeText(serverId, entry.relPath, content)
      setOriginalContent(content)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FileWarning className="h-8 w-8 opacity-40" />
        <p className="text-sm">Selecciona un archivo del árbol para editarlo</p>
      </div>
    )
  }

  if (entry.isDirectory) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        "{entry.name}" es una carpeta
      </div>
    )
  }

  if (!isLikelyTextFile(entry.name)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FileWarning className="h-8 w-8 opacity-40" />
        <p className="text-sm">Vista previa no disponible para este tipo de archivo</p>
        <p className="text-xs">Usa el botón de descarga para exportarlo</p>
      </div>
    )
  }

  const dirty = content !== originalContent

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs text-foreground">{entry.relPath}</span>
          {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="Cambios sin guardar" />}
          {truncated && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-warning">
              <AlertTriangle className="h-3 w-3" /> archivo truncado (muy grande)
            </span>
          )}
        </div>
        <Button size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={!dirty || saving} onClick={handleSave}>
          <Save className="h-3.5 w-3.5" /> {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      {error && <div className="border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</div>}

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando...</div>
        ) : (
          <Editor
            path={entry.relPath}
            language={languageForFile(entry.name)}
            value={content}
            onChange={(v) => setContent(v ?? '')}
            theme="vs-dark"
            options={{
              fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2
            }}
          />
        )}
      </div>
    </div>
  )
}
