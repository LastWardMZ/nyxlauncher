import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { chmodSync } from 'fs'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import treeKill from 'tree-kill'
import type {
  ConsoleLine,
  ConsoleLineStream,
  ServerConfig,
  ServerMetrics,
  ServerRuntimeState,
  ServerStatus
} from '../shared/types'

const CONSOLE_BUFFER_LIMIT = 4000
const GRACEFUL_STOP_TIMEOUT_MS = 15_000
const AUTO_RESTART_DELAY_MS = 5_000

interface RunningServer {
  proc: ChildProcessWithoutNullStreams
  status: ServerStatus
  pid: number | null
  startedAt: string | null
  lastExitCode: number | null
  /** true when the user explicitly requested stop/restart/kill, to distinguish from a crash */
  stopRequested: boolean
  stdoutBuffer: string
  stderrBuffer: string
  gracefulStopTimer: NodeJS.Timeout | null
  autoRestartTimer: NodeJS.Timeout | null
}

export interface ServerManagerEvents {
  consoleLine: (line: ConsoleLine) => void
  stateChanged: (state: ServerRuntimeState) => void
}

/**
 * Owns every live child process, one per configured server. Deliberately
 * generic: it knows nothing about Paper/Purpur/Velocity specifics beyond
 * "spawn this executable with these args in this cwd", so it keeps working if the
 * dedicated server's launch contract changes.
 */
export class ServerManager extends EventEmitter {
  private running = new Map<string, RunningServer>()
  private consoleBuffers = new Map<string, ConsoleLine[]>()

  getState(serverId: string): ServerRuntimeState {
    const running = this.running.get(serverId)
    return {
      id: serverId,
      status: running?.status ?? 'stopped',
      pid: running?.pid ?? null,
      startedAt: running?.startedAt ?? null,
      metrics: null,
      lastExitCode: running?.lastExitCode ?? null
    }
  }

  getConsoleBuffer(serverId: string): ConsoleLine[] {
    return this.consoleBuffers.get(serverId) ?? []
  }

  isRunning(serverId: string): boolean {
    const s = this.running.get(serverId)?.status
    return s === 'starting' || s === 'online' || s === 'stopping'
  }

  start(config: ServerConfig): void {
    if (this.isRunning(config.id)) return

    const { executable, args } = resolveLaunchCommand(config)
    // Forge/NeoForge installs are launched via their generated run script —
    // run.bat on Windows (needs a shell to execute through child_process.spawn),
    // run.sh on Linux/Docker (its shebang line makes it directly executable
    // once the exec bit is set — no shell needed, unlike the Windows case).
    if (process.platform !== 'win32' && executable.endsWith('.sh')) {
      try {
        chmodSync(executable, 0o755)
      } catch {
        // Best-effort — if this fails, the spawn below fails with a clear
        // EACCES that surfaces in the console like any other launch error.
      }
    }
    const needsShell = /\.(bat|cmd)$/i.test(executable)
    // With shell:true, Node hands the command + args to cmd.exe as one string
    // rather than quoting them itself — an unquoted path with a space (e.g. any
    // working directory like "C:\...\a prueba") gets split into two tokens and
    // cmd.exe reports "not recognized". Quote anything that contains whitespace.
    const quoteIfNeeded = (s: string): string => (/\s/.test(s) ? `"${s}"` : s)

    let proc: ChildProcessWithoutNullStreams
    try {
      proc = spawn(needsShell ? quoteIfNeeded(executable) : executable, needsShell ? args.map(quoteIfNeeded) : args, {
        cwd: config.workingDirectory,
        env: process.env,
        windowsHide: true,
        shell: needsShell
      })
    } catch (err) {
      this.pushSystemLine(config.id, `Failed to start server: ${(err as Error).message}`)
      this.setStatus(config.id, 'error')
      return
    }

    const entry: RunningServer = {
      proc,
      status: 'starting',
      pid: proc.pid ?? null,
      startedAt: new Date().toISOString(),
      lastExitCode: null,
      stopRequested: false,
      stdoutBuffer: '',
      stderrBuffer: '',
      gracefulStopTimer: null,
      autoRestartTimer: null
    }
    this.running.set(config.id, entry)
    this.emitState(config.id)
    this.pushSystemLine(
      config.id,
      `Starting "${config.name}" (${executable} ${args.join(' ')}) in ${config.workingDirectory}`
    )

    proc.stdout.on('data', (chunk: Buffer) => this.handleChunk(config.id, 'stdout', chunk))
    proc.stderr.on('data', (chunk: Buffer) => this.handleChunk(config.id, 'stderr', chunk))

    // No reliable "server is ready" signal exists across arbitrary server
    // binaries, so treat "process spawned successfully" as online once the OS
    // hands back a pid; the console remains the source of truth for readiness.
    if (proc.pid) {
      entry.status = 'online'
      this.emitState(config.id)
    }

    proc.on('error', (err) => {
      this.pushSystemLine(config.id, `Process error: ${err.message}`)
    })

    proc.on('exit', (code, signal) => {
      const wasStopRequested = entry.stopRequested
      entry.lastExitCode = code
      entry.pid = null
      if (entry.gracefulStopTimer) clearTimeout(entry.gracefulStopTimer)

      this.pushSystemLine(
        config.id,
        `Process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
      )

      if (wasStopRequested) {
        entry.status = 'stopped'
        this.emitState(config.id)
        this.running.delete(config.id)
        return
      }

      entry.status = code === 0 ? 'stopped' : 'crashed'
      this.emitState(config.id)
      this.running.delete(config.id)

      if (config.autoRestart && code !== 0) {
        this.pushSystemLine(config.id, `Auto-restart is enabled, restarting in 5s...`)
        entry.autoRestartTimer = setTimeout(() => this.start(config), AUTO_RESTART_DELAY_MS)
      }
    })
  }

  sendCommand(serverId: string, command: string): boolean {
    const entry = this.running.get(serverId)
    if (!entry || entry.status !== 'online') return false
    entry.proc.stdin.write(`${command}\n`)
    this.pushLine(serverId, 'system', `> ${command}`)
    return true
  }

  /** Graceful stop: try to let the server shut itself down, then force-kill after a timeout. */
  stop(serverId: string): void {
    const entry = this.running.get(serverId)
    if (!entry) return
    entry.stopRequested = true
    this.setStatus(serverId, 'stopping')

    const wroteStdin = entry.proc.stdin.writable
    if (wroteStdin) {
      entry.proc.stdin.write('stop\n')
    }

    entry.gracefulStopTimer = setTimeout(() => {
      if (this.running.has(serverId)) {
        this.pushSystemLine(serverId, 'Graceful stop timed out, force killing process tree...')
        this.kill(serverId)
      }
    }, GRACEFUL_STOP_TIMEOUT_MS)
  }

  restart(config: ServerConfig): void {
    const entry = this.running.get(config.id)
    if (!entry) {
      this.start(config)
      return
    }
    entry.stopRequested = true
    this.setStatus(config.id, 'stopping')
    const restartAfterExit = (): void => {
      this.start(config)
    }
    entry.proc.once('exit', restartAfterExit)
    if (entry.proc.stdin.writable) entry.proc.stdin.write('stop\n')
    entry.gracefulStopTimer = setTimeout(() => {
      if (this.running.has(config.id)) this.kill(config.id)
    }, GRACEFUL_STOP_TIMEOUT_MS)
  }

  kill(serverId: string): void {
    const entry = this.running.get(serverId)
    if (!entry?.pid) return
    entry.stopRequested = true
    treeKill(entry.pid, 'SIGKILL', (err) => {
      if (err) this.pushSystemLine(serverId, `Force kill error: ${err.message}`)
    })
  }

  applyMetrics(serverId: string, metrics: ServerMetrics): void {
    const entry = this.running.get(serverId)
    if (!entry) return
    this.emit('stateChanged', {
      id: serverId,
      status: entry.status,
      pid: entry.pid,
      startedAt: entry.startedAt,
      metrics,
      lastExitCode: entry.lastExitCode
    } satisfies ServerRuntimeState)
  }

  getPid(serverId: string): number | null {
    return this.running.get(serverId)?.pid ?? null
  }

  private handleChunk(serverId: string, stream: ConsoleLineStream, chunk: Buffer): void {
    const entry = this.running.get(serverId)
    const bufKey = stream === 'stdout' ? 'stdoutBuffer' : 'stderrBuffer'
    const text = (entry ? entry[bufKey] : '') + chunk.toString('utf8')
    const parts = text.split(/\r?\n/)
    const remainder = parts.pop() ?? ''
    if (entry) entry[bufKey] = remainder
    for (const line of parts) {
      if (line.length > 0) this.pushLine(serverId, stream, line)
    }
  }

  private pushSystemLine(serverId: string, text: string): void {
    this.pushLine(serverId, 'system', text)
  }

  private pushLine(serverId: string, stream: ConsoleLineStream, text: string): void {
    const line: ConsoleLine = {
      id: randomUUID(),
      serverId,
      stream,
      text,
      timestamp: new Date().toISOString()
    }
    const buf = this.consoleBuffers.get(serverId) ?? []
    buf.push(line)
    if (buf.length > CONSOLE_BUFFER_LIMIT) buf.splice(0, buf.length - CONSOLE_BUFFER_LIMIT)
    this.consoleBuffers.set(serverId, buf)
    this.emit('consoleLine', line)
  }

  private setStatus(serverId: string, status: ServerStatus): void {
    const entry = this.running.get(serverId)
    if (entry) entry.status = status
    this.emitState(serverId)
  }

  private emitState(serverId: string): void {
    this.emit('stateChanged', this.getState(serverId))
  }
}

function resolveLaunchCommand(config: ServerConfig): { executable: string; args: string[] } {
  if (config.launchMode === 'command') {
    return { executable: config.executable, args: config.args }
  }

  // "jar" mode: launch the configured jar through the configured Java runtime.
  const javaBin = config.java.javaPath.trim() || 'java'
  const jvmArgs: string[] = []
  if (config.java.minMemoryMb > 0) jvmArgs.push(`-Xms${config.java.minMemoryMb}M`)
  if (config.java.maxMemoryMb > 0) jvmArgs.push(`-Xmx${config.java.maxMemoryMb}M`)
  if (config.java.extraArgs.trim()) jvmArgs.push(...config.java.extraArgs.trim().split(/\s+/))
  // Minecraft/Paper/Purpur/Velocity all pop up their own Swing GUI window unless
  // told "nogui" — the whole point of this launcher is that the console lives in
  // the app, so force it on rather than relying on the user remembering to type it.
  const programArgs = config.args.includes('nogui') ? config.args : [...config.args, 'nogui']
  return {
    executable: javaBin,
    args: [...jvmArgs, '-jar', config.executable, ...programArgs]
  }
}

export const serverManager = new ServerManager()
