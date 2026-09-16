import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { authService } from '../../services/auth.service'
import { useAuthStore } from '../../store/auth.store'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Requerido'),
})

type FormValues = z.infer<typeof schema>

/** CU-06 Iniciar sesión. */
export function Login() {
  const navigate = useNavigate()
  const setSession = useAuthStore((state) => state.setSession)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      const { accessToken } = await authService.login(values.email, values.password)
      setSession(accessToken)
      navigate('/')
    } catch (err: unknown) {
      // CU-06 (flujos 5a/6a/7a/7b): el backend siempre responde con un
      // mensaje que no distingue el motivo exacto salvo el bloqueo temporal.
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'No pudimos iniciar sesión';
      setServerError(message)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
      >
        <h1 className="text-xl font-semibold text-neutral-800">Iniciar sesión</h1>

        <div>
          <input
            {...register('email')}
            type="email"
            placeholder="Email"
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
        </div>

        <div>
          <input
            {...register('password')}
            type="password"
            placeholder="Contraseña"
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
        </div>

        {serverError && <p className="text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-neutral-800 py-2 text-white disabled:opacity-50"
        >
          Iniciar sesión
        </button>

        <div className="flex justify-between text-sm text-neutral-600">
          <Link to="/register" className="underline">Crear cuenta</Link>
          <Link to="/forgot-password" className="underline">Olvidé mi contraseña</Link>
        </div>
      </form>
    </main>
  )
}
