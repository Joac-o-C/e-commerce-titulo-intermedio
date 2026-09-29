import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '../../order-status.js';

/** Motivos de CU-19 (flujo 5a); obligatorio, de una lista (decisión de la Fase 6). */
export enum AdminCancelReason {
  FALTA_STOCK = 'falta_stock',
  SOSPECHA_FRAUDE = 'sospecha_fraude',
  PAGO_ABANDONADO = 'pago_abandonado',
  PEDIDO_CLIENTE_FUERA_DE_PLAZO = 'pedido_cliente_fuera_de_plazo',
  OTRO = 'otro',
}

export const ADMIN_CANCEL_REASON_LABELS: Record<AdminCancelReason, string> = {
  [AdminCancelReason.FALTA_STOCK]: 'Falta de stock',
  [AdminCancelReason.SOSPECHA_FRAUDE]: 'Sospecha de fraude',
  [AdminCancelReason.PAGO_ABANDONADO]: 'Pago abandonado',
  [AdminCancelReason.PEDIDO_CLIENTE_FUERA_DE_PLAZO]: 'Pedido del Cliente fuera de plazo',
  [AdminCancelReason.OTRO]: 'Otro',
};

/** CU-19 (flujo 5a). */
export class AdminCancelOrderDto {
  @IsEnum(OrderStatus)
  expectedStatus: OrderStatus;

  @IsEnum(AdminCancelReason)
  reason: AdminCancelReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}
