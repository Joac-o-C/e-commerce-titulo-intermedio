import { createBrowserRouter } from 'react-router-dom'
import { Home } from '../pages/shop/Home'

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
])
