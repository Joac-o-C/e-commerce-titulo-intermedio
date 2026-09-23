import { Controller, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtAccessPayload } from '../auth/strategies/jwt.strategy.js';
import { AWAITING_PAYMENT_STATUSES } from '../orders/order-status.js';
import { OrdersService } from '../orders/orders.service.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * CU-05 (paso 11): al volver de la pasarela, la página de resultado pide
   * reconciliar el pedido antes de mostrar su estado. No confía en los
   * parámetros de la URL de retorno: consulta los pagos a la pasarela, con
   * el mismo modelo de confianza que el webhook y la reconciliación
   * periódica. Necesario en sandbox sin túnel (el webhook nunca llega).
   *
   * @usecase CU-05 Procesar confirmación de pago (paso 11)
   */
  @Post('orders/:orderId/sync')
  @HttpCode(200)
  async sync(@CurrentUser() user: JwtAccessPayload, @Param('orderId', ParseUUIDPipe) orderId: string) {
    // Chequeo de pertenencia liviano (sin ítems): el detalle se arma una sola vez, al final.
    const order = await this.ordersService.findById(orderId);
    if (!order || order.userId !== user.sub) throw new NotFoundException('El pedido no existe');
    // Sólo hay algo que reconciliar mientras el pedido espera el pago.
    if (AWAITING_PAYMENT_STATUSES.includes(order.status)) {
      await this.paymentsService.reconcileOrder(orderId, 'retorno_cliente');
    }
    return this.ordersService.findOwnedOrFail(user.sub, orderId);
  }
}
