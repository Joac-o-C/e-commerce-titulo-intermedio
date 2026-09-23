import { Body, Controller, Headers, HttpCode, Logger, Post, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

/**
 * Endpoint de webhooks de MercadoPago (CU-05). Público: la autenticidad no
 * la da una sesión sino la firma `x-signature`, que valida PaymentsService.
 */
@Controller('payments/webhook')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * CU-05 (paso 2): responde 200 de inmediato y procesa en segundo plano.
   * Si MercadoPago no recibe un 2xx rápido, reintenta la notificación; el
   * procesamiento (con hasta 3 consultas a la pasarela) puede tardar más
   * que su timeout. Los fallos quedan auditados y los retoma la
   * reconciliación periódica.
   *
   * @usecase CU-05 Procesar confirmación de pago
   */
  @Post('mercadopago')
  @HttpCode(200)
  receive(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    void this.paymentsService
      .handleNotification({ headers, query, body })
      .catch((err: Error) => this.logger.error(`Error procesando webhook de pago: ${err.message}`, err.stack));
    return { received: true };
  }
}
