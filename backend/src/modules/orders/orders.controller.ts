import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtAccessPayload } from '../auth/strategies/jwt.strategy.js';
import { CheckoutService } from './checkout.service.js';
import { CustomerOrdersService } from './customer-orders.service.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { QueryMyOrdersDto } from './dto/query-my-orders.dto.js';
import { OrderCancellationService } from './order-cancellation.service.js';

/** Pedidos del Cliente: CU-13 y las acciones que se disparan desde su detalle. */
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly customerOrders: CustomerOrdersService,
    private readonly cancellation: OrderCancellationService,
    private readonly checkoutService: CheckoutService,
  ) {}

  /** @usecase CU-13 Ver mis pedidos (pasos 1-3, flujos 2a/3a) */
  @Get()
  list(@CurrentUser() user: JwtAccessPayload, @Query() query: QueryMyOrdersDto) {
    return this.customerOrders.list(user.sub, query);
  }

  /** @usecase CU-13 Ver mis pedidos (pasos 4-7, flujos 5a/6a/7a) */
  @Get(':id')
  findOne(@CurrentUser() user: JwtAccessPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.customerOrders.getDetail(user.sub, id);
  }

  /** @usecase CU-14 Cancelar pedido */
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    const result = await this.cancellation.cancelByCustomer(user.sub, id, dto);
    // CU-14 (paso 9): la vista del pedido se actualiza con el detalle nuevo.
    return { ...result, order: await this.customerOrders.getDetail(user.sub, id) };
  }

  /** @usecase CU-13 Ver mis pedidos (flujo 7b: reintentar el pago, reutiliza CU-03) */
  @Post(':id/retry-payment')
  @HttpCode(200)
  retryPayment(@CurrentUser() user: JwtAccessPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkoutService.retryPayment(user.sub, id);
  }
}
