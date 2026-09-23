import { useQuery } from '@tanstack/react-query'
import { cartService } from '../../../services/cart.service'
import { useAuthStore } from '../../../store/auth.store'

/** CU-11 Modificar o quitar ítem del carrito (vista), sólo Cliente autenticado. */
export function useCart() {
  const status = useAuthStore((s) => s.status)
  return useQuery({
    queryKey: ['cart'],
    queryFn: () => cartService.get(),
    enabled: status === 'authenticated',
  })
}
