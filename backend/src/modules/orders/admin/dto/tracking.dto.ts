import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** CU-19 (paso 6): datos de envío, todos opcionales. */
export class TrackingDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  number?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dispatchedAt?: string;
}
