import { PartialType } from '@nestjs/mapped-types';
import { CreateAddressDto } from './create-address.dto.js';

/** CU-12 (flujo 3a): mismos campos que el alta, todos opcionales. */
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
