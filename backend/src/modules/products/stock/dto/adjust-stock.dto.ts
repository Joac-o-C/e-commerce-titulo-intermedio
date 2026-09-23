import { IsIn, IsInt, IsNotEmpty, Min } from 'class-validator';
import { StockMovementType } from '../../entities/stock-movement.entity.js';

/** `venta` sólo la genera el sistema al acreditarse un pago (CU-05), nunca un ajuste manual. */
export const MANUAL_STOCK_MOVEMENT_TYPES = [
  StockMovementType.REPOSICION,
  StockMovementType.AJUSTE,
  StockMovementType.MERMA,
  StockMovementType.DEVOLUCION,
] as const;
export type ManualStockMovementType = (typeof MANUAL_STOCK_MOVEMENT_TYPES)[number];

/** CU-18 Gestionar stock: ajustar el stock total de una variante. */
export class AdjustStockDto {
  @IsIn(MANUAL_STOCK_MOVEMENT_TYPES)
  type: ManualStockMovementType;

  // CU-18 (flujo 6a): la cantidad siempre se informa como entero positivo;
  // el signo del movimiento lo decide `type` (reposición/devolución suman,
  // merma resta, ajuste fija un valor absoluto).
  @IsInt()
  @Min(0)
  quantity: number;

  @IsNotEmpty()
  reason: string;
}
