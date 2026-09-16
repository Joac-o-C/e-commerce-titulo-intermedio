import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { authService } from '../../services/auth.service'
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX } from './password-policy'

const schema = z
  .object({
    password: z.string().regex(PASSWORD_POLICY_REGEX, PASSWORD_POLICY_MESSAGE),
    passwordConfirmation: z.string(),
  })
  // CU-08 (flujo 6a): password y confirmación deben coincidir.
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  })

type FormValues = z.infer<typeof schema>

/** CU-08 Recuperar contraseña (restablecimiento con el enlace). */
export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: FormValues) => {
    if (!token) {
      setServerError('El enlace no es válido')
      return
    }
    setServerError(null)
    try {
      await authService.resetPassword(token, values.password, values.passwordConfirmation)
      setDone(true)
    } catch (err: unknown) {
      // CU-08 (flujos 3a/6b): token inválido/expirado o password igual a la vigente.
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'No pudimos actualizar la contraseña';
      setServerError(message)
    }
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-neutral-800">Contraseña actualizada, ya podés iniciar sesión.</p>
          <Link to="/login" className="underline text-sm">Ir a iniciar sesión</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
      >
        <h1 className="text-xl font-semibold text-neutral-800">Nueva contraseña</h1>

        <div>
          <input
            {...register('password')}
            type="password"
            placeholder="Nueva contraseña"
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
        </div>

        <div>
          <input
            {...register('passwordConfirmation')}
            type="password"
            placeholder="Confirmar contraseña"
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          {errors.passwordConfirmation && (
            <p className="text-sm text-red-600">{errors.passwordConfirmation.message}</p>
          )}
        </div>

        {serverError && <p className="text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-neutral-800 py-2 text-white disabled:opacity-50"
        >
          Guardar contraseña
        </button>
      </form>
    </main>
  )
}
