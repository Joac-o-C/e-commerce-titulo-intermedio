import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authService } from '../../services/auth.service'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { SubmitButton } from '../../components/ui/SubmitButton'
import { TextField } from '../../components/ui/TextField'

type Status = 'verifying' | 'success' | 'error'

/** CU-07 Verificar correo (confirmación del enlace + sub-flujo Reenviar). */
export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error')

  const [resendEmail, setResendEmail] = useState('')
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [isResending, setIsResending] = useState(false)

  useEffect(() => {
    if (!token) return
    authService
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  const handleResend = async (event: React.FormEvent) => {
    event.preventDefault()
    setResendMessage(null)
    setIsResending(true)
    try {
      const { data } = await authService.resendVerification(resendEmail)
      setResendMessage(data.message)
    } catch {
      setResendMessage('No pudimos procesar el reenvío, intentá de nuevo')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <main className="flex justify-center px-4 py-12 sm:py-16">
      <div
        aria-busy={status === 'verifying' || isResending}
        className="w-full max-w-sm overflow-hidden rounded-lg bg-white shadow text-center"
      >
        <ProgressBar active={status === 'verifying' || isResending} />
        <div className="space-y-4 p-6">
          {status === 'verifying' && <p>Verificando tu cuenta...</p>}

          {status === 'success' && (
            <>
              <p className="text-neutral-800">Cuenta verificada, ya podés iniciar sesión.</p>
              <Link to="/login" className="underline text-sm">Ir a iniciar sesión</Link>
            </>
          )}

          {status === 'error' && (
            <>
              <p className="text-neutral-800">
                El enlace de verificación no es válido o venció. Pedí uno nuevo:
              </p>
              <form onSubmit={handleResend}>
                <fieldset disabled={isResending} className="space-y-3 text-left">
                  <TextField
                    label="Email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="nombre@correo.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                  />
                  <SubmitButton loading={isResending} loadingLabel="Reenviando…">
                    Reenviar verificación
                  </SubmitButton>
                </fieldset>
              </form>
              {resendMessage && <p className="text-sm text-neutral-700">{resendMessage}</p>}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
