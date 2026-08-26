import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

interface Props {
  children: ReactNode
  onReset?: () => void
}

interface State {
  error: Error | null
  componentStack: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? null })
  }

  render(): ReactNode {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Algo ha fallado</h1>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            Ha ocurrido un error inesperado al mostrar esta pantalla. Puedes volver al panel principal sin perder
            tus servidores.
          </p>
          <p className="mx-auto mt-2 max-w-md break-words font-mono text-[11px] text-muted-foreground/70">
            {error.message}
          </p>
          {componentStack && (
            <pre className="mx-auto mt-2 max-h-32 max-w-md overflow-auto rounded-md border border-border/60 bg-muted/10 p-2 text-left text-[10px] leading-tight text-muted-foreground/60">
              {componentStack.trim()}
            </pre>
          )}
        </div>
        <Button
          className="gap-1.5"
          onClick={() => {
            this.props.onReset?.()
            this.setState({ error: null })
          }}
        >
          <RotateCw className="h-3.5 w-3.5" /> Volver
        </Button>
      </div>
    )
  }
}
