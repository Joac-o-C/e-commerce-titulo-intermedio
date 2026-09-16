import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '../../services/auth.service'

/** CU-08 Recuperar contraseña (sub-flujo Solicitar). */
export function ForgotPassword() {
  const [email, setEmail] = useState('')
  // CU-08: mensaje siempre genérico, sin distinguir si el email existe.
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const { data } = await authService.forgotPassword(email)
    setMessage(data.message)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
      >
        <h1 className="text-xl font-semibold text-neutral-800">Recuperar contraseña</h1>

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded border border-neutral-300 px-3 py-2"
        />

        {message && <p className="text-sm text-neutral-700">{message}</p>}

        <button type="submit" className="w-full rounded bg-neutral-800 py-2 text-white">
          Enviar enlace
        </button>

        <p className="text-center text-sm text-neutral-600">
          <Link to="/login" className="underline">Volver a iniciar sesión</Link>
        </p>
      </form>
    </main>
  )
}
