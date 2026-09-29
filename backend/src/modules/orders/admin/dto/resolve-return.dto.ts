import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReturnItemCondition } from '../../returns/entities/return-request-item.entity.js';
import { ReturnRequestStatus } from '../../returns/entities/return-request.entity.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** CU-22: bandeja de solicitudes. */
export class QueryAdminReturnsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsEnum(ReturnRequestStatus)
  status?: ReturnRequestStatus;

  /** CU-22 (flujo 8a): aprobadas cuyo plazo de recepción venció. */
  @IsOptional()
  @IsIn(['vencidas'])
  reception?: 'vencidas';
}

export class ApprovedItemDto {
  @IsUUID()
  orderItemId: string;

  @IsInt()
  @Min(0)
  quantityApproved: number;
}

/** CU-22 (pasos 4-5, flujo 4a). */
export class ApproveReturnDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ApprovedItemDto)
  items: ApprovedItemDto[];

  /** Paso 4: nota interna (sólo administradores). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  internalNote?: string;

  /** Flujo 4a: motivo de lo no aprobado, lo ve el Cliente. Obligatorio si la aprobación es parcial. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}

/** CU-22 (flujo 3a). */
export class RejectReturnDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indicá el motivo del rechazo' })
  @MaxLength(1000)
  reason: string;
}

export class ReceivedItemDto {
  @IsUUID()
  orderItemId: string;

  @IsInt()
  @Min(0)
  quantityReceived: number;

  @IsEnum(ReturnItemCondition)
  condition: ReturnItemCondition;

  /** Devolución que llegó dañada (9a): el admin decide si se reembolsa. Ignorado en buen estado (siempre se reembolsa) y en cambios. */
  @IsOptional()
  @IsBoolean()
  refund?: boolean;

  /** Cambio (10a): variante de reposición, del mismo producto. */
  @IsOptional()
  @IsUUID()
  replacementVariantId?: string;
}

/** CU-22 (pasos 8-12, flujos 9a/10a). */
export class ReceiveReturnDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReceivedItemDto)
  items: ReceivedItemDto[];

  /** 9a: novedad de la recepción (sólo administradores). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  internalNote?: string;

  /** Nota para el Cliente sobre la resolución. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}

/** CU-22 (flujo 10a): despacho de la reposición (decisión de la Fase 6), seguimiento opcional. */
export class DispatchReplacementDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  carrier?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  number?: string;
}
