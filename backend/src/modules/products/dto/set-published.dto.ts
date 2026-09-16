import { IsBoolean } from 'class-validator';

/** CU-16 (flujo 3b): publicar/despublicar. */
export class SetPublishedDto {
  @IsBoolean()
  isPublished: boolean;
}
