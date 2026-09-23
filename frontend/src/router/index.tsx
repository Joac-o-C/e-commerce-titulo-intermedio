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
import { Checkout } from '../pages/account/Checkout'
import { CheckoutResult } from '../pages/checkout/CheckoutResult'
import { SimulatedPayment } from '../pages/checkout/SimulatedPayment'
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
      // Pantalla de la pasarela simulada (sólo con PAYMENT_GATEWAY=fake):
      // pública, como la de MercadoPago.
      { path: '/checkout/simulated-payment', element: <SimulatedPayment /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/account/addresses', element: <Addresses /> },
          // CU-03: sin checkout de invitado, la sesión es precondición.
          { path: '/checkout', element: <Checkout /> },
          // CU-05 (paso 11): retorno de la pasarela.
          { path: '/checkout/result', element: <CheckoutResult /> },
        ],
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
