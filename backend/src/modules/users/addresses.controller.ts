import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtAccessPayload } from '../auth/strategies/jwt.strategy.js';
import { AddressesService } from './addresses.service.js';
import { CreateAddressDto } from './dto/create-address.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';

@Controller('users/me/addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  /** @usecase CU-12 Gestionar direcciones */
  @Get()
  findAll(@CurrentUser() user: JwtAccessPayload) {
    return this.addressesService.findAllForUser(user.sub);
  }

  /** @usecase CU-12 Gestionar direcciones */
  @Post()
  create(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(user.sub, dto);
  }

  /** @usecase CU-12 Gestionar direcciones (flujo 3a) */
  @Patch(':id')
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(user.sub, id, dto);
  }

  /** @usecase CU-12 Gestionar direcciones (flujo 3b) */
  @Delete(':id')
  remove(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Query('newDefaultId') newDefaultId?: string,
  ) {
    return this.addressesService.remove(user.sub, id, newDefaultId);
  }

  /** @usecase CU-12 Gestionar direcciones (flujo 3c) */
  @Patch(':id/default')
  markDefault(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.addressesService.markDefault(user.sub, id);
  }
}
