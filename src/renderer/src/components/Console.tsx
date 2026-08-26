import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Download, Search, Trash2, ArrowDownToLine, ScrollText } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { consoleIndicatesEulaNeeded } from '@renderer/lib/eulaParser'
import type { ConsoleLine } from '@shared/types'

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[38;5;203m',
  purple: '\x1b[38;5;141m',
  gray: '\x1b[38;5;244m'
}

function colorForLine(line: ConsoleLine): string {
  if (line.stream === 'stderr') return ANSI.red
  if (line.stream === 'system') return ANSI.purple
  if (/\bERROR\b/i.test(line.text)) return ANSI.red
  if (/\bWARN\b/i.test(line.text)) return '\x1b[38;5;214m'
  return ''
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour12: false })
}

function renderLine(line: ConsoleLine): string {
  const color = colorForLine(line)
  const ts = `${ANSI.gray}${formatTimestamp(line.timestamp)}${ANSI.reset}`
  return `${ts}  ${color}${line.text}${ANSI.reset}`
}

interface ConsoleProps {
  serverId: string
  lines: ConsoleLine[]
  canSendCommand: boolean
  onSendCommand: (command: string) => void
  onClear: () => void
}

export function Console({ serverId, lines, canSendCommand, onSendCommand, onClear }: ConsoleProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const writtenCountRef = useRef(0)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [eulaAccepted, setEulaAccepted] = useState(false)
  const [acceptingEula, setAcceptingEula] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      convertEol: true,
      fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 8000,
      theme: {
        background: '#0d0f16',
        foreground: '#d8dbe6',
        cursor: '#8b5cf6',
        selectionBackground: '#8b5cf655'
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)

    termRef.current = term
    fitRef.current = fit
    writtenCountRef.current = 0

    // The container can still be mid-layout (e.g. right after the "add server"
    // dialog closes and this view mounts in the same tick) where clientWidth/
    // clientHeight are momentarily 0 — FitAddon.fit() throws RangeError in that
    // case, which crashes the whole render tree since it runs inside an effect.
    const safeFit = (): void => {
      const el = containerRef.current
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
      try {
        fit.fit()
      } catch {
        // ignore transient layout glitches, next resize will retry
      }
    }

    requestAnimationFrame(safeFit)

    const resizeObserver = new ResizeObserver(() => safeFit())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId])

  const filteredLines = useMemo(() => {
    if (!filter.trim()) return lines
    const needle = filter.toLowerCase()
    return lines.filter((l) => l.text.toLowerCase().includes(needle))
  }, [lines, filter])

  // Full re-render when the filter changes or the buffer was cleared/shrunk; incremental append otherwise.
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    const needsFullRewrite = filteredLines.length < writtenCountRef.current || filter.trim().length > 0
    if (needsFullRewrite) {
      term.clear()
      term.reset()
      for (const line of filteredLines) term.writeln(renderLine(line))
      writtenCountRef.current = filteredLines.length
    } else {
      for (let i = writtenCountRef.current; i < filteredLines.length; i++) {
        term.writeln(renderLine(filteredLines[i]))
      }
      writtenCountRef.current = filteredLines.length
    }

    if (autoScroll) term.scrollToBottom()
  }, [filteredLines, filter, autoScroll])

  const eulaNeeded = consoleIndicatesEulaNeeded(lines) && !eulaAccepted

  async function handleAcceptEula(): Promise<void> {
    setAcceptingEula(true)
    try {
      await window.launcher.files.writeText(
        serverId,
        'eula.txt',
        '# By changing the setting below to TRUE you are indicating your agreement to the Minecraft EULA (https://aka.ms/MinecraftEULA).\neula=true\n'
      )
      setEulaAccepted(true)
    } finally {
      setAcceptingEula(false)
    }
  }

  function handleClear(): void {
    termRef.current?.clear()
    termRef.current?.reset()
    writtenCountRef.current = 0
    onClear()
  }

  function handleExport(): void {
    const content = lines.map((l) => `[${l.timestamp}] [${l.stream}] ${l.text}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `console-${serverId}-${Date.now()}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  function submitCommand(): void {
    const trimmed = command.trim()
    if (!trimmed) return
    onSendCommand(trimmed)
    setHistory((h) => [...h, trimmed])
    setHistoryIndex(null)
    setCommand('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      submitCommand()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length === 0) return
      const nextIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(nextIndex)
      setCommand(history[nextIndex])
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex === null) return
      const nextIndex = historyIndex + 1
      if (nextIndex >= history.length) {
        setHistoryIndex(null)
        setCommand('')
      } else {
        setHistoryIndex(nextIndex)
        setCommand(history[nextIndex])
      }
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-[#0d0f16]">
      <div className="flex items-center gap-2 border-b border-border bg-card/60 px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar log..."
            className="h-7 bg-transparent pl-8 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant={autoScroll ? 'secondary' : 'outline'}
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setAutoScroll((v) => !v)}
          title="Auto-scroll"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs" onClick={handleExport} title="Exportar log">
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs" onClick={handleClear} title="Limpiar consola">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {eulaNeeded && (
        <div className="flex items-center gap-2 border-b border-border bg-warning/10 px-3 py-2 text-xs text-warning">
          <ScrollText className="h-3.5 w-3.5 shrink-0" />
          <p className="flex-1">
            El servidor necesita que aceptes la EULA de Mojang para arrancar (aka.ms/MinecraftEULA).
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={acceptingEula}
            onClick={handleAcceptEula}
          >
            {acceptingEula ? 'Aceptando...' : 'Aceptar y crear eula.txt'}
          </Button>
        </div>
      )}

      <div ref={containerRef} className="min-h-0 flex-1 px-2 py-1" />

      <div className="border-t border-border bg-card/60 p-2">
        <div className="flex items-center gap-2">
          <span className={cn('font-mono text-sm', canSendCommand ? 'text-primary' : 'text-muted-foreground/40')}>
            &gt;
          </span>
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!canSendCommand}
            placeholder={canSendCommand ? 'Escribe un comando y pulsa Enter...' : 'El servidor no está en línea'}
            className="h-8 flex-1 font-mono text-sm"
          />
          <Button size="sm" disabled={!canSendCommand || !command.trim()} onClick={submitCommand}>
            Enviar
          </Button>
        </div>
      </div>
    </div>
  )
}
