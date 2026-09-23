import { createHmac, randomUUID } from 'node:crypto';
import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago';

/** Ventana contra replay: una notificación firmada hace más de 5 min se descarta. */
const TOLERANCE_SECONDS = 300;

type HeaderValue = string | string[] | undefined;

/**
 * CU-05 (paso 3): valida el header `x-signature` de MercadoPago (HMAC-SHA256
 * sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`) con el validador
 * del SDK oficial. Devuelve el motivo del rechazo, o `null` si es auténtica.
 */
export function verifyWebhookSignature(params: {
  xSignature: HeaderValue;
  xRequestId: HeaderValue;
  dataId: string;
  secret: string;
}): string | null {
  try {
    // MercadoPago firma el `data.id` en minúsculas (los ids alfanuméricos
    // pueden llegar en mayúsculas en la query); el SDK no lo normaliza.
    WebhookSignatureValidator.validate({
      ...params,
      dataId: params.dataId.toLowerCase(),
      toleranceSeconds: TOLERANCE_SECONDS,
    });
    return null;
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError) return err.reason;
    throw err;
  }
}

/**
 * Firma una notificación con el mismo esquema que MercadoPago. La usa
 * `FakePaymentGateway` para que su webhook simulado recorra exactamente la
 * misma validación que uno real, y los tests e2e para armar webhooks válidos.
 */
export function signWebhook(dataId: string, secret: string): { 'x-signature': string; 'x-request-id': string } {
  const requestId = randomUUID();
  const ts = String(Math.floor(Date.now() / 1000)); // segundos, como MercadoPago
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const hash = createHmac('sha256', secret).update(manifest).digest('hex');
  return { 'x-signature': `ts=${ts},v1=${hash}`, 'x-request-id': requestId };
}
