import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/** CU-17 ABM de categorías (alta). Sin `parentId`, la categoría es de primer nivel. */
export class CreateCategoryDto {
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
