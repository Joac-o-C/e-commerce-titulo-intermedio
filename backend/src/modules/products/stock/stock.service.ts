import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CategoriesService } from '../categories/categories.service.js';
import { DEFAULT_LOW_STOCK_THRESHOLD } from '../products.service.js';
import { Product } from '../entities/product.entity.js';
import { ProductVariant } from '../entities/product-variant.entity.js';
import { StockMovement, StockMovementType } from '../entities/stock-movement.entity.js';
import { AdjustStockDto, type ManualStockMovementType } from './dto/adjust-stock.dto.js';
import { QueryStockDto } from './dto/query-stock.dto.js';
import { SetLowStockThresholdDto } from './dto/set-low-stock-threshold.dto.js';

const STOCK_PAGE_SIZE = 50;

/**
 * CU-18 Gestionar stock. No reserva ni libera stock (eso lo hacen
 * CU-03/05/14/19/22 sobre `stockReserved`): sólo ajusta `stockTotal` y
 * consulta el historial.
 */
@Injectable()
export class StockService {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(StockMovement)
    private readonly movementRepo: Repository<StockMovement>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly categoriesService: CategoriesService,
  ) {}

  /** @usecase CU-18 Gestionar stock (paso 2: listado) */
  async list(query: QueryStockDto) {
    const offset = query.offset ?? 0;
    const qb = this.variantRepo
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .where('product.isActive = true');

    if (query.productId) qb.andWhere('product.id = :productId', { productId: query.productId });
    if (query.categoryId) {
      // Mismo criterio que el catálogo (CU-04): la categoría incluye sus subcategorías.
      const categoryIds = await this.categoriesService.findDescendantIds([query.categoryId]);
      qb.andWhere(
        'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = product.id AND pc.category_id IN (:...categoryIds))',
        { categoryIds },
      );
    }
    if (query.onlyOutOfStock) {
      qb.andWhere('(variant.stock_total - variant.stock_reserved) <= 0');
    } else if (query.onlyLowStock) {
      qb.andWhere(
        '(variant.stock_total - variant.stock_reserved) > 0 AND (variant.stock_total - variant.stock_reserved) <= COALESCE(product.low_stock_threshold, :defaultThreshold)',
        { defaultThreshold: DEFAULT_LOW_STOCK_THRESHOLD },
      );
    }

    const total = await qb.clone().getCount();
    const variants = await qb.orderBy('product.name', 'ASC').offset(offset).limit(STOCK_PAGE_SIZE).getMany();

    return {
      items: variants.map((v) => this.toStockItem(v)),
      total,
      hasMore: offset + variants.length < total,
    };
  }

  /**
   * CU-18 (paso 5-9): aplica un movimiento de inventario sobre una variante.
   * @usecase CU-18 Gestionar stock
   */
  async adjust(variantId: string, dto: AdjustStockDto, actorId: string) {
    const variant = await this.variantRepo.findOne({ where: { id: variantId }, relations: { product: true } });
    if (!variant) throw new NotFoundException('La variante no existe');
    // CU-18 (flujo 2a): producto dado de baja.
    if (!variant.product.isActive) {
      throw new BadRequestException('No se puede ajustar el stock de un producto dado de baja');
    }

    const newTotal = this.computeNewTotal(variant.stockTotal, dto.type, dto.quantity);
    if (newTotal < variant.stockReserved) {
      // CU-18 (flujo 6b)
      throw new BadRequestException(
        `El ajuste dejaría el stock total (${newTotal}) por debajo del reservado (${variant.stockReserved})`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      variant.stockTotal = newTotal;
      const savedVariant = await manager.save(ProductVariant, variant);

      const movement = manager.create(StockMovement, {
        variantId: variant.id,
        type: dto.type,
        quantity: dto.quantity,
        resultingStockTotal: newTotal,
        reason: dto.reason,
        actorId,
      });
      await manager.save(StockMovement, movement);

      savedVariant.product = variant.product;
      return this.toStockItem(savedVariant);
    });
  }

  /** @usecase CU-18 Gestionar stock (flujo 3a: configurar umbral) */
  async setThreshold(productId: string, dto: SetLowStockThresholdDto): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id: productId, isActive: true } });
    if (!product) throw new NotFoundException('El producto no existe');
    product.lowStockThreshold = dto.lowStockThreshold ?? null;
    return this.productRepo.save(product);
  }

  /** @usecase CU-18 Gestionar stock (flujo 3b: ver historial) */
  async history(variantId: string) {
    const variant = await this.variantRepo.findOne({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('La variante no existe');
    const movements = await this.movementRepo.find({
      where: { variantId },
      relations: { actor: true },
      order: { createdAt: 'DESC' },
    });
    // No se devuelve el actor completo (incluye passwordHash): sólo lo
    // necesario para mostrar quién hizo el movimiento.
    return movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      resultingStockTotal: m.resultingStockTotal,
      reason: m.reason,
      createdAt: m.createdAt,
      actor: m.actor ? { id: m.actor.id, firstName: m.actor.firstName, lastName: m.actor.lastName } : null,
    }));
  }

  private computeNewTotal(currentTotal: number, type: ManualStockMovementType, quantity: number): number {
    switch (type) {
      case StockMovementType.REPOSICION:
      case StockMovementType.DEVOLUCION:
        return currentTotal + quantity;
      case StockMovementType.MERMA:
        return currentTotal - quantity;
      case StockMovementType.AJUSTE:
        return quantity;
    }
  }

  private toStockItem(variant: ProductVariant) {
    const threshold = variant.product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    const stockAvailable = variant.stockTotal - variant.stockReserved;
    return {
      variantId: variant.id,
      sku: variant.sku,
      attributes: variant.attributes,
      productId: variant.product.id,
      productName: variant.product.name,
      stockTotal: variant.stockTotal,
      stockReserved: variant.stockReserved,
      stockAvailable,
      lowStockThreshold: threshold,
      // Umbral crudo (sin aplicar el default global): permite al frontend
      // distinguir "sin override" (null, muestra el input vacío) de "override
      // explícito igual al default", para no fijar uno de más al abrir y
      // guardar el modal de configuración sin haber tocado nada.
      productLowStockThreshold: variant.product.lowStockThreshold,
      isLowStock: stockAvailable > 0 && stockAvailable <= threshold,
      isOutOfStock: stockAvailable <= 0,
    };
  }
}
