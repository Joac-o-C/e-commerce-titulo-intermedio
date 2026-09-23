import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtAccessPayload } from '../auth/strategies/jwt.strategy.js';
import { OrdersService } from './orders.service.js';

/**
 * Pedidos del Cliente. En la Fase 4 sólo el detalle mínimo que necesita la
 * página de retorno de la pasarela; el listado, historial y acciones son
 * CU-13/14/15 (Fase 5).
 */
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /** @usecase CU-05 Procesar confirmación de pago (paso 11: estado al volver de la pasarela) */
  @Get(':id')
  findOne(@CurrentUser() user: JwtAccessPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOwnedOrFail(user.sub, id);
  }
}
