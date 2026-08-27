import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { isRemoteBrowser } from '@renderer/runtimeContext'

type AuthState =
  | { phase: 'loading' }
  | { phase: 'setup' }
  | { phase: 'login' }
  | { phase: 'ready' }

async function fetchStatus(): Promise<{ accountConfigured: boolean; authenticated: boolean }> {
  const res = await fetch('/api/auth/status', { credentials: 'include' })
  return res.json()
}

/** Gates the whole app behind a login screen for browser (remote) clients
 *  only — the desktop app never renders this. First-run: if no admin
 *  account exists yet, shows a "set your password" form instead of login. */
export function RemoteLoginGate({ children }: { children: React.ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>(isRemoteBrowser ? { phase: 'loading' } : { phase: 'ready' })
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function refresh(): Promise<void> {
    const status = await fetchStatus()
    if (!status.accountConfigured) setState({ phase: 'setup' })
    else if (!status.authenticated) setState({ phase: 'login' })
    else setState({ phase: 'ready' })
  }

  useEffect(() => {
    if (!isRemoteBrowser) return
    refresh()
    const onUnauthenticated = (): void => setState({ phase: 'login' })
    window.addEventListener('nyx-remote-unauthenticated', onUnauthenticated)
    return () => window.removeEventListener('nyx-remote-unauthenticated', onUnauthenticated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSetup(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo crear la cuenta')
      setState({ phase: 'ready' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogin(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo iniciar sesión')
      setState({ phase: 'ready' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (state.phase === 'ready') return <>{children}</>

  if (state.phase === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background bg-grid-fade">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  const isSetup = state.phase === 'setup'

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background bg-grid-fade p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{isSetup ? 'Configura el acceso remoto' : 'Iniciar sesión'}</CardTitle>
          <CardDescription>
            {isSetup
              ? 'Crea una contraseña para proteger el panel de NyxLauncher.'
              : 'Introduce la contraseña del panel para continuar.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={isSetup ? handleSetup : handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {isSetup && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {isSetup ? 'Crear cuenta y entrar' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
