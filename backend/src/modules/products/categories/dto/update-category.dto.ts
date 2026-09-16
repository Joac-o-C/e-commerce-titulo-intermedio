import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto.js';

/** CU-17 (flujo 3a/3b): mismos campos que el alta, todos opcionales. */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
