import { createBrowserRouter } from 'react-router-dom'
import { Home } from '../pages/shop/Home'
import { Login } from '../pages/auth/Login'
import { Register } from '../pages/auth/Register'
import { VerifyEmail } from '../pages/auth/VerifyEmail'
import { ForgotPassword } from '../pages/auth/ForgotPassword'
import { ResetPassword } from '../pages/auth/ResetPassword'
import { Addresses } from '../pages/account/Addresses'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'

/**
 * Router raíz de la SPA. Cada fase del plan de ejecución agrega sus rutas
 * acá a medida que las páginas correspondientes existen (auth en Fase 1,
 * catálogo en Fase 2, etc.) — ver plan-de-ejecucion.md.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  {
    element: <ProtectedRoute />,
    children: [{ path: '/account/addresses', element: <Addresses /> }],
  },
])
