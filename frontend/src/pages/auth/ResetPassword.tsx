import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { authService } from '../../services/auth.service'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { SubmitButton } from '../../components/ui/SubmitButton'
import { PasswordField } from '../../components/ui/PasswordField'
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
      <main className="flex justify-center px-4 py-12 sm:py-16">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-neutral-800">Contraseña actualizada, ya podés iniciar sesión.</p>
          <Link to="/login" className="underline text-sm">Ir a iniciar sesión</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex justify-center px-4 py-12 sm:py-16">
      <form
        onSubmit={handleSubmit(onSubmit)}
        aria-busy={isSubmitting}
        className="w-full max-w-sm overflow-hidden rounded-lg bg-white shadow"
      >
        <ProgressBar active={isSubmitting} />
        <fieldset disabled={isSubmitting} className="space-y-4 p-6">
          <h1 className="text-xl font-semibold text-neutral-800">Nueva contraseña</h1>

          <PasswordField
            {...register('password')}
            label="Nueva contraseña"
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

          {serverError && <p className="text-sm text-red-600">{serverError}</p>}

          <SubmitButton loading={isSubmitting} loadingLabel="Guardando…">
            Guardar contraseña
          </SubmitButton>
        </fieldset>
      </form>
    </main>
  )
}
