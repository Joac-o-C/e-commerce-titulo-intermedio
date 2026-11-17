import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '../../services/auth.service'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { SubmitButton } from '../../components/ui/SubmitButton'
import { TextField } from '../../components/ui/TextField'

/** CU-08 Recuperar contraseña (sub-flujo Solicitar). */
export function ForgotPassword() {
  const [email, setEmail] = useState('')
  // CU-08: mensaje siempre genérico, sin distinguir si el email existe.
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage(null)
    setError(null)
    try {
      const { data } = await authService.forgotPassword(email)
      setMessage(data.message)
    } catch {
      setError('No pudimos procesar el pedido, intentá de nuevo')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        className="w-full max-w-sm overflow-hidden rounded-lg bg-white shadow"
      >
        <ProgressBar active={isSubmitting} />
        <fieldset disabled={isSubmitting} className="space-y-4 p-6">
          <h1 className="text-xl font-semibold text-neutral-800">Recuperar contraseña</h1>

          <p className="text-sm text-neutral-600">
            Te mandamos un enlace para que elijas una contraseña nueva.
          </p>

          <TextField
            label="Email de tu cuenta"
            type="email"
            required
            autoComplete="email"
            placeholder="nombre@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {message && <p className="text-sm text-neutral-700">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <SubmitButton loading={isSubmitting} loadingLabel="Enviando…">
            Enviar enlace
          </SubmitButton>

          <p className="text-center text-sm text-neutral-600">
            <Link to="/login" className="underline">Volver a iniciar sesión</Link>
          </p>
        </fieldset>
      </form>
    </main>
  )
}
