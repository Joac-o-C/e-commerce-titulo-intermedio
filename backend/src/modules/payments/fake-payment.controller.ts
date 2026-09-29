import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { OrdersService } from '../orders/orders.service.js';
import { UserRole } from '../users/entities/user.entity.js';
import { SettlePaymentDto, SettleRefundDto, SimulatePaymentDto } from './dto/simulate-payment.dto.js';
import { FakePaymentGateway } from './gateway/fake-payment.gateway.js';
import { signWebhook } from './gateway/webhook-signature.js';
import { PaymentsService } from './payments.service.js';

/**
 * "Pantalla" de la pasarela simulada (PAYMENT_GATEWAY=fake): lo que en
 * MercadoPago haría el Cliente dentro de Checkout Pro. Sólo existe en
 * modo fake — con la pasarela real responde 404 — y por eso es pública,
 * igual que la pantalla de pago de la pasarela real (salvo `pending`, que
 * es del panel admin).
 *
 * Al "pagar" dispara el mismo webhook firmado que mandaría MercadoPago, y
 * lo procesa por el camino real de CU-05 (validación de firma incluida).
 * Lo espera antes de responder (MercadoPago no lo haría) para que la
 * página de resultado ya encuentre el pedido actualizado.
 */
@Controller('payments/fake')
export class FakePaymentController {
  private readonly enabled: boolean;
  private readonly frontendUrl: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly fakeGateway: FakePaymentGateway,
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('PAYMENT_GATEWAY') === 'fake';
    this.frontendUrl = config.get<string>('FRONTEND_URL')!;
    this.webhookSecret = config.get<string>('PAYMENT_WEBHOOK_SECRET')!;
  }

  @Get('preferences/:preferenceId')
  getPreference(@Param('preferenceId') preferenceId: string) {
    this.assertEnabled();
    const { id, orderId, items, amount, expiresAt } = this.fakeGateway.getPreference(preferenceId);
    return { preferenceId: id, orderId, items, amount: amount.toFixed(2), expiresAt };
  }

  @Post('preferences/:preferenceId/pay')
  async pay(@Param('preferenceId') preferenceId: string, @Body() dto: SimulatePaymentDto) {
    this.assertEnabled();
    const payment = this.fakeGateway.simulatePayment(preferenceId, dto.outcome);
    await this.notify(payment.id);
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      // Mismos parámetros que agrega MercadoPago a la back_url.
      redirectUrl: `${this.frontendUrl}/checkout/result?orderId=${payment.orderId}&payment_id=${payment.id}&status=${payment.status}`,
    };
  }

  @Post('payments/:paymentId/settle')
  async settle(@Param('paymentId') paymentId: string, @Body() dto: SettlePaymentDto) {
    this.assertEnabled();
    const payment = this.fakeGateway.settlePayment(paymentId, dto.outcome);
    await this.notify(payment.id);
    return { paymentId: payment.id, orderId: payment.orderId, status: payment.status };
  }

  /** Si la pasarela simulada está activa: el panel admin muestra sus botones sólo en ese caso. */
  @Get('status')
  status() {
    return { enabled: this.enabled };
  }

  /**
   * Pantalla "Pasarela simulada" del panel admin (decisión de la Fase 6).
   * A diferencia del resto de este controller, es sólo para
   * administradores: lista pagos y reembolsos de todos los clientes.
   */
  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRADOR)
  async pending() {
    this.assertEnabled();
    const { payments, refunds } = this.fakeGateway.listPending();
    const orderIds = [...new Set([...payments, ...refunds].map((x) => x.orderId).filter((id): id is string => id !== null))];
    const numbers = await this.ordersService.findOrderNumbers(orderIds);
    const order = (orderId: string | null) => (orderId ? { id: orderId, orderNumber: numbers.get(orderId) ?? null } : null);
    return {
      payments: payments.map((p) => ({ id: p.id, amount: p.amount.toFixed(2), status: p.status, order: order(p.orderId) })),
      refunds: refunds.map((r) => ({ id: r.id, paymentId: r.paymentId, amount: r.amount.toFixed(2), status: r.status, order: order(r.orderId) })),
    };
  }

  /**
   * Lo que haría MercadoPago más tarde con un reembolso (CU-21 pasos 7-9):
   * acreditarlo o rechazarlo, y avisarlo por el webhook del pago.
   */
  @Post('refunds/:refundId/settle')
  async settleRefund(@Param('refundId') refundId: string, @Body() dto: SettleRefundDto) {
    this.assertEnabled();
    const refund = this.fakeGateway.settleRefund(refundId, dto.outcome);
    await this.notify(refund.paymentId);
    return { refundId: refund.id, status: refund.status };
  }

  private notify(paymentId: string) {
    return this.paymentsService.handleNotification({
      headers: signWebhook(paymentId, this.webhookSecret),
      query: { 'data.id': paymentId, type: 'payment' },
      body: { type: 'payment', action: 'payment.updated', data: { id: paymentId } },
    });
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new NotFoundException();
  }
}
