import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Resolución manual de un reembolso ("devuelto por fuera", decisión de la Fase 6). */
export class ResolveRefundDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Indicá cómo se devolvió el dinero' })
  @MaxLength(1000)
  note: string;
}
