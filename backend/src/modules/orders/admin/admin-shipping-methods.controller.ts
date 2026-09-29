import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/entities/user.entity.js';
import { AdminShippingMethodsService } from './admin-shipping-methods.service.js';
import { CreateShippingMethodDto, SetShippingMethodActiveDto, UpdateShippingMethodDto } from './dto/shipping-method.dto.js';

/** ABM de métodos de envío (alcance extra de la Fase 6; sin CU propio). */
@Controller('admin/shipping-methods')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRADOR)
export class AdminShippingMethodsController {
  constructor(private readonly shippingMethods: AdminShippingMethodsService) {}

  @Get()
  list() {
    return this.shippingMethods.list();
  }

  @Post()
  create(@Body() dto: CreateShippingMethodDto) {
    return this.shippingMethods.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShippingMethodDto) {
    return this.shippingMethods.update(id, dto);
  }

  @Patch(':id/active')
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetShippingMethodActiveDto) {
    return this.shippingMethods.setActive(id, dto.isActive);
  }
}
