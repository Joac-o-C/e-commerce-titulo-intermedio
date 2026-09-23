import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettlePaymentDto, SimulatePaymentDto } from './dto/simulate-payment.dto.js';
import { FakePaymentGateway } from './gateway/fake-payment.gateway.js';
import { signWebhook } from './gateway/webhook-signature.js';
import { PaymentsService } from './payments.service.js';

/**
 * "Pantalla" de la pasarela simulada (PAYMENT_GATEWAY=fake): lo que en
 * MercadoPago haría el Cliente dentro de Checkout Pro. Sólo existe en
 * modo fake — con la pasarela real responde 404 — y por eso es pública,
 * igual que la pantalla de pago de la pasarela real.
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
