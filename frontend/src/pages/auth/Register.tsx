import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { authService } from '../../services/auth.service'
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX } from './password-policy'

const schema = z
  .object({
    firstName: z.string().min(1, 'Requerido'),
    lastName: z.string().min(1, 'Requerido'),
    email: z.string().email('Email inválido'),
    password: z.string().regex(PASSWORD_POLICY_REGEX, PASSWORD_POLICY_MESSAGE),
    passwordConfirmation: z.string(),
    acceptTerms: z.literal(true, { message: 'Debés aceptar los términos y condiciones' }),
  })
  // CU-01 (flujo 5a): password y confirmación deben coincidir.
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  })

type FormValues = z.infer<typeof schema>

/** CU-01 Registrar usuario. */
export function Register() {
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      await authService.register(values)
      setSubmitted(true)
    } catch (err: unknown) {
      // CU-01 (flujo 6a): el backend responde 409 con mensaje genérico si el email ya está en uso.
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'No pudimos crear la cuenta, intentá de nuevo';
      setServerError(message)
    }
  }

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <p className="max-w-sm text-center text-neutral-700">
          Revisá tu casilla de correo para activar la cuenta.
        </p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
      >
        <h1 className="text-xl font-semibold text-neutral-800">Crear cuenta</h1>

        <div>
          <input
            {...register('firstName')}
            placeholder="Nombre"
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          {errors.firstName && <p className="text-sm text-red-600">{errors.firstName.message}</p>}
        </div>

        <div>
          <input
            {...register('lastName')}
            placeholder="Apellido"
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          {errors.lastName && <p className="text-sm text-red-600">{errors.lastName.message}</p>}
        </div>

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

        <div className="flex items-center gap-2">
          <input {...register('acceptTerms')} type="checkbox" id="acceptTerms" />
          <label htmlFor="acceptTerms" className="text-sm text-neutral-700">
            Acepto los términos y condiciones
          </label>
        </div>
        {errors.acceptTerms && <p className="text-sm text-red-600">{errors.acceptTerms.message}</p>}

        {serverError && <p className="text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-neutral-800 py-2 text-white disabled:opacity-50"
        >
          Crear cuenta
        </button>

        <p className="text-center text-sm text-neutral-600">
          ¿Ya tenés cuenta? <Link to="/login" className="underline">Iniciar sesión</Link>
        </p>
      </form>
    </main>
  )
}
