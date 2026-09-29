/**
 * Piezas comunes de las plantillas de CU-20: cada plantilla describe su
 * mensaje como una lista de bloques y `compose()` arma, a partir de la misma
 * lista, la versión HTML (layout común, todo escapado) y la de texto plano.
 */

export interface ComposedMessage {
  subject: string;
  html: string;
  text: string;
}

/** Datos que no vienen del CU solicitante sino de la configuración y del destinatario. */
export interface TemplateContext {
  frontendUrl: string;
  verificationTtlHours: number;
  resetTtlHours: number;
  reservationTtlHours: number;
  recipientName: string | null;
  /** Link a `/account/orders/:id` cuando el correo es sobre un pedido. */
  orderUrl: string | null;
}

export type TemplateData = Record<string, unknown>;
export type TemplateFn = (data: TemplateData, ctx: TemplateContext) => ComposedMessage;

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'button'; label: string; url: string }
  | { kind: 'table'; head: string[]; rows: string[][] };

export const p = (text: string): Block => ({ kind: 'p', text });
export const button = (label: string, url: string): Block => ({ kind: 'button', label, url });
export const table = (head: string[], rows: string[][]): Block => ({ kind: 'table', head, rows });

/** Botón "Ver pedido" sólo si el correo está asociado a un pedido. */
export const orderButton = (ctx: TemplateContext): Block[] =>
  ctx.orderUrl ? [button('Ver pedido', ctx.orderUrl)] : [];

const SIGNATURE = 'El equipo de la tienda';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const moneyFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const dateFormat = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires',
});
const dayFormat = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'America/Argentina/Buenos_Aires' });

/** Texto de un dato escalar; un faltante (o un objeto inesperado) queda vacío en vez de "[object Object]". */
function scalar(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

export function formatMoney(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? moneyFormat.format(n) : scalar(value);
}

export function formatDate(value: unknown, withTime = true): string {
  const d = value instanceof Date ? value : new Date(scalar(value));
  if (Number.isNaN(d.getTime())) return scalar(value);
  return (withTime ? dateFormat : dayFormat).format(d);
}

/** Lectura tolerante de `data`: un dato faltante nunca rompe la composición. */
export function str(data: TemplateData, key: string): string {
  return scalar(data[key]);
}

export function compose(subject: string, ctx: TemplateContext, blocks: Block[]): ComposedMessage {
  const greeting = ctx.recipientName ? `Hola ${ctx.recipientName},` : 'Hola,';
  const all = [p(greeting), ...blocks];
  return {
    subject,
    html: renderHtml(subject, all),
    text: [...all.map(renderText), SIGNATURE].join('\n\n'),
  };
}

function renderText(block: Block): string {
  switch (block.kind) {
    case 'p':
      return block.text;
    case 'button':
      return `${block.label}: ${block.url}`;
    case 'table':
      return block.rows.map((row) => `- ${row.join(' · ')}`).join('\n');
  }
}

function renderHtmlBlock(block: Block): string {
  switch (block.kind) {
    case 'p':
      return `<p style="margin:0 0 16px">${escapeHtml(block.text)}</p>`;
    case 'button':
      return (
        `<p style="margin:24px 0"><a href="${escapeHtml(block.url)}" ` +
        `style="background:#111827;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">` +
        `${escapeHtml(block.label)}</a></p>`
      );
    case 'table': {
      const cell = 'padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left';
      const head = block.head.map((h) => `<th style="${cell}">${escapeHtml(h)}</th>`).join('');
      const rows = block.rows
        .map((row) => `<tr>${row.map((c) => `<td style="${cell}">${escapeHtml(c)}</td>`).join('')}</tr>`)
        .join('');
      return (
        `<table style="border-collapse:collapse;width:100%;margin:0 0 16px;font-size:14px">` +
        `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
      );
    }
  }
}

function renderHtml(subject: string, blocks: Block[]): string {
  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">` +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;line-height:1.5">` +
    blocks.map(renderHtmlBlock).join('') +
    `<p style="margin:24px 0 0;color:#6b7280">${SIGNATURE}</p>` +
    `</div></body></html>`
  );
}
