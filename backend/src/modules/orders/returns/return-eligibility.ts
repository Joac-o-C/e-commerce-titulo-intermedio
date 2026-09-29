import { ReturnRequestStatus } from './entities/return-request.entity.js';

interface RequestLike {
  status: ReturnRequestStatus;
  items: {
    orderItemId: string;
    quantityRequested: number;
    quantityApproved: number | null;
    quantityReceived: number | null;
  }[];
}

/**
 * CU-15 (precondición 4, pasos 3 y 5), con la regla de la Fase 6: se
 * pueden pedir todas las unidades que no estén aprobadas ni en una
 * solicitud abierta. Una solicitud "solicitada" bloquea lo pedido; una
 * "aprobada", lo aprobado; una "resuelta", lo que efectivamente llegó (lo
 * aprobado que no se recibió queda libre otra vez); una "rechazada", nada.
 *
 * @usecase CU-15 Solicitar cambio o devolución
 */
export function eligibleUnits(orderItemId: string, purchased: number, requests: RequestLike[]): number {
  let blocked = 0;
  for (const request of requests) {
    for (const item of request.items) {
      if (item.orderItemId !== orderItemId) continue;
      if (request.status === ReturnRequestStatus.SOLICITADA) blocked += item.quantityRequested;
      else if (request.status === ReturnRequestStatus.APROBADA) blocked += item.quantityApproved ?? 0;
      else if (request.status === ReturnRequestStatus.RESUELTA) blocked += item.quantityReceived ?? 0;
    }
  }
  return Math.max(purchased - blocked, 0);
}
