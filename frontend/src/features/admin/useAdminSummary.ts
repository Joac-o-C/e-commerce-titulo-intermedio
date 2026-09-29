import { useQuery } from '@tanstack/react-query'
import { adminOrdersService } from '../../services/admin-orders.service'
import { fakePaymentService } from '../../services/fake-payment.service'
import { useAuthStore } from '../../store/auth.store'

/** Contadores de la barra de admin (decisión de la Fase 6). */
export function useAdminSummary() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'administrador')
  return useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: adminOrdersService.summary,
    enabled: isAdmin,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}

/**
 * La pantalla "Pasarela simulada" sólo existe con PAYMENT_GATEWAY=fake.
 * Devuelve la query entera para que la pantalla distinga "cargando" o
 * "error" de "apagada".
 */
export function useFakeGatewayStatus() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'administrador')
  return useQuery({
    queryKey: ['fake-gateway', 'status'],
    queryFn: fakePaymentService.status,
    enabled: isAdmin,
    staleTime: Infinity,
  })
}

/** Para la barra de admin: mientras no se sabe, el link queda oculto. */
export function useFakeGatewayEnabled() {
  return useFakeGatewayStatus().data?.enabled ?? false
}
