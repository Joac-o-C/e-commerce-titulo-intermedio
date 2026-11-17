import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { AuthBootstrap } from './components/auth/AuthBootstrap'
import { router } from './router'
import { STORE_NAME } from './lib/brand'
import { initTheme } from './lib/theme'
import './styles/index.css'

// Cliente único de TanStack Query para todo el árbol: cachea y sincroniza
// los datos que vienen del backend (catálogo, carrito, pedidos, etc.).
const queryClient = new QueryClient()

document.title = STORE_NAME
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>
        <RouterProvider router={router} />
      </AuthBootstrap>
    </QueryClientProvider>
  </StrictMode>,
)
