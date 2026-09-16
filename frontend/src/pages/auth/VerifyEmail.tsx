import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authService } from '../../services/auth.service'

type Status = 'verifying' | 'success' | 'error'

/** CU-07 Verificar correo (confirmación del enlace + sub-flujo Reenviar). */
export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error')

  const [resendEmail, setResendEmail] = useState('')
  const [resendMessage, setResendMessage] = useState<string | null>(null)

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
    try {
      const { data } = await authService.resendVerification(resendEmail)
      setResendMessage(data.message)
    } catch {
      setResendMessage('No pudimos procesar el reenvío, intentá de nuevo')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow text-center">
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
            <form onSubmit={handleResend} className="space-y-3 text-left">
              <input
                type="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded border border-neutral-300 px-3 py-2"
              />
              <button
                type="submit"
                className="w-full rounded bg-neutral-800 py-2 text-white"
              >
                Reenviar verificación
              </button>
            </form>
            {resendMessage && <p className="text-sm text-neutral-700">{resendMessage}</p>}
          </>
        )}
      </div>
    </main>
  )
}
