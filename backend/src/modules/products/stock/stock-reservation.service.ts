import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProductVariant } from '../entities/product-variant.entity.js';
import { StockMovement, StockMovementType } from '../entities/stock-movement.entity.js';

export interface StockLine {
  variantId: string;
  quantity: number;
}

export type ReserveResult = { ok: true } | { ok: false; variantId: string };

/**
 * Reserva, liberación y descuento firme de stock sobre `stockReserved` /
 * `stockTotal` de una variante — la parte del inventario que mueven los
 * pedidos (CU-03/05, y más adelante CU-14/19/22), no el Administrador
 * (eso es `StockService`, CU-18).
 *
 * Cada operación es un único UPDATE condicional sobre la fila: la condición
 * (`stock_total - stock_reserved >= :qty`) y la escritura ocurren en la
 * misma sentencia, así dos checkouts concurrentes por la última unidad
 * nunca pueden reservarla ambos (un "leer y después escribir" en Node sería
 * TOCTOU). Todos los métodos reciben el `EntityManager` de la transacción
 * del llamador, para que la reserva sea atómica con la creación del pedido.
 */
@Injectable()
export class StockReservationService {
  /**
   * @usecase CU-03 Realizar checkout (paso 15: reserva de stock)
   */
  async reserve(manager: EntityManager, lines: StockLine[]): Promise<ReserveResult> {
    const reserved: StockLine[] = [];
    for (const line of this.sorted(lines)) {
      const result = await manager
        .createQueryBuilder()
        .update(ProductVariant)
        .set({ stockReserved: () => 'stock_reserved + :qty' })
        .where('id = :id AND stock_total - stock_reserved >= :qty', { id: line.variantId, qty: line.quantity })
        .execute();
      if (result.affected !== 1) {
        // CU-03 (flujo 13a): otro pedido se llevó el stock entre la
        // revalidación y la confirmación. Todo o nada: se deshace lo ya
        // reservado del lote, porque no todos los llamadores abortan la
        // transacción (CU-05 re-reserva y sigue aunque no alcance).
        await this.release(manager, reserved);
        return { ok: false, variantId: line.variantId };
      }
      reserved.push(line);
    }
    return { ok: true };
  }

  /**
   * Devuelve al disponible lo reservado por un pedido que no se pagó
   * (CU-03 17a/18a, CU-05 7.b). `GREATEST` evita dejar la reserva en
   * negativo si un ajuste manual de CU-18 ya la hubiera tocado.
   */
  async release(manager: EntityManager, lines: StockLine[]): Promise<void> {
    for (const line of this.sorted(lines)) {
      await manager
        .createQueryBuilder()
        .update(ProductVariant)
        .set({ stockReserved: () => 'GREATEST(stock_reserved - :qty, 0)' })
        .where('id = :id', { id: line.variantId, qty: line.quantity })
        .execute();
    }
  }

  /**
   * Descuento firme de stock de un pedido pagado (CU-05 7.a): baja
   * `stockTotal` y, si el pedido todavía tenía la reserva vigente, también
   * `stockReserved`. Si la reserva ya se había liberado (venció, o el pago
   * se había rechazado antes), intenta tomar la cantidad del disponible.
   *
   * Devuelve las líneas que no se pudieron cubrir: CU-05 (flujo 7a-1) pide
   * confirmar el pago igual y dejar el faltante anotado para el
   * Administrador, no fallar.
   *
   * @usecase CU-05 Procesar confirmación de pago (7.a: descuento firme)
   */
  async confirmSale(
    manager: EntityManager,
    lines: StockLine[],
    opts: { reservationActive: boolean; reason: string },
  ): Promise<StockLine[]> {
    const shortages: StockLine[] = [];
    for (const line of this.sorted(lines)) {
      const qb = manager.createQueryBuilder().update(ProductVariant);

      const result = opts.reservationActive
        ? await qb
            .set({
              stockTotal: () => 'stock_total - :qty',
              stockReserved: () => 'stock_reserved - :qty',
            })
            .where('id = :id AND stock_reserved >= :qty', { id: line.variantId, qty: line.quantity })
            .execute()
        : await qb
            .set({ stockTotal: () => 'stock_total - :qty' })
            .where('id = :id AND stock_total - stock_reserved >= :qty', { id: line.variantId, qty: line.quantity })
            .execute();

      if (result.affected !== 1) {
        // CU-05 (flujo 7a-1): la reserva venció y el stock ya no alcanza.
        shortages.push(line);
        continue;
      }

      // El UPDATE ya tiene el lock de la fila en esta transacción: el valor
      // leído es exactamente el que dejó (la forma de `result.raw` con
      // RETURNING depende del driver; una lectura explícita no).
      const { stockTotal: resultingStockTotal } = await manager.findOneOrFail(ProductVariant, {
        select: { id: true, stockTotal: true },
        where: { id: line.variantId },
      });
      await manager.save(
        manager.create(StockMovement, {
          variantId: line.variantId,
          type: StockMovementType.VENTA,
          quantity: line.quantity,
          resultingStockTotal,
          reason: opts.reason,
          actorId: null,
        }),
      );
    }
    return shortages;
  }

  /**
   * Orden estable por variante: dos transacciones que reservan sobre las
   * mismas variantes toman los locks de fila en el mismo orden y no pueden
   * quedar en deadlock entre sí.
   */
  private sorted(lines: StockLine[]): StockLine[] {
    return [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
  }
}
