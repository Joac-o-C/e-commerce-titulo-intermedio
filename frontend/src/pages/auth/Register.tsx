import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { authService } from '../../services/auth.service'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { SubmitButton } from '../../components/ui/SubmitButton'
import { TextField } from '../../components/ui/TextField'
import { PasswordField } from '../../components/ui/PasswordField'
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
        aria-busy={isSubmitting}
        className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow"
      >
        <ProgressBar active={isSubmitting} />
        <fieldset disabled={isSubmitting} className="space-y-4 p-6">
          <h1 className="text-xl font-semibold text-neutral-800">Crear cuenta</h1>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              {...register('firstName')}
              label="Nombre"
              autoComplete="given-name"
              error={errors.firstName?.message}
            />
            <TextField
              {...register('lastName')}
              label="Apellido"
              autoComplete="family-name"
              error={errors.lastName?.message}
            />
          </div>

          <TextField
            {...register('email')}
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="nombre@correo.com"
            error={errors.email?.message}
          />

          <PasswordField
            {...register('password')}
            label="Contraseña"
            autoComplete="new-password"
            hint="Mínimo 8 caracteres, con una mayúscula y un número."
            error={errors.password?.message}
          />

          <PasswordField
            {...register('passwordConfirmation')}
            label="Repetir contraseña"
            autoComplete="new-password"
            error={errors.passwordConfirmation?.message}
          />

          <div className="flex items-center gap-2">
            <input {...register('acceptTerms')} type="checkbox" id="acceptTerms" />
            <label htmlFor="acceptTerms" className="text-sm text-neutral-700">
              Acepto los términos y condiciones
            </label>
          </div>
          {errors.acceptTerms && <p className="text-sm text-red-600">{errors.acceptTerms.message}</p>}

          {serverError && <p className="text-sm text-red-600">{serverError}</p>}

          <SubmitButton loading={isSubmitting} loadingLabel="Creando cuenta…">
            Crear cuenta
          </SubmitButton>

          <p className="text-center text-sm text-neutral-600">
            ¿Ya tenés cuenta? <Link to="/login" className="underline">Iniciar sesión</Link>
          </p>
        </fieldset>
      </form>
    </main>
  )
}
