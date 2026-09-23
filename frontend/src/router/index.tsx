import { createBrowserRouter } from 'react-router-dom'
import { ProductList } from '../pages/shop/ProductList'
import { ProductDetail } from '../pages/shop/ProductDetail'
import { Cart } from '../pages/shop/Cart'
import { Login } from '../pages/auth/Login'
import { Register } from '../pages/auth/Register'
import { VerifyEmail } from '../pages/auth/VerifyEmail'
import { ForgotPassword } from '../pages/auth/ForgotPassword'
import { ResetPassword } from '../pages/auth/ResetPassword'
import { Addresses } from '../pages/account/Addresses'
import { AdminCategories } from '../pages/admin/Categories'
import { AdminProducts } from '../pages/admin/Products'
import { AdminStock } from '../pages/admin/Stock'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'
import { AdminRoute } from '../components/auth/AdminRoute'
import { Layout } from '../components/layout/Layout'

/**
 * Router raíz de la SPA. Cada fase del plan de ejecución agrega sus rutas
 * acá a medida que las páginas correspondientes existen (auth en Fase 1,
 * catálogo en Fase 2, carrito en Fase 3, etc.) — ver plan-de-ejecucion.md.
 * `Layout` (header + badge de carrito) envuelve todas las rutas.
 */
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <ProductList /> },
      { path: '/products/:id', element: <ProductDetail /> },
      { path: '/cart', element: <Cart /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/verify-email', element: <VerifyEmail /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      {
        element: <ProtectedRoute />,
        children: [{ path: '/account/addresses', element: <Addresses /> }],
      },
      {
        element: <AdminRoute />,
        children: [
          { path: '/admin/categories', element: <AdminCategories /> },
          { path: '/admin/products', element: <AdminProducts /> },
          { path: '/admin/stock', element: <AdminStock /> },
        ],
      },
    ],
  },
])
