import { IsEnum, IsInt, IsNotEmpty, Min } from 'class-validator';
import { StockMovementType } from '../../entities/stock-movement.entity.js';

/** CU-18 Gestionar stock: ajustar el stock total de una variante. */
export class AdjustStockDto {
  @IsEnum(StockMovementType)
  type: StockMovementType;

  // CU-18 (flujo 6a): la cantidad siempre se informa como entero positivo;
  // el signo del movimiento lo decide `type` (reposición/devolución suman,
  // merma resta, ajuste fija un valor absoluto).
  @IsInt()
  @Min(0)
  quantity: number;

  @IsNotEmpty()
  reason: string;
}
