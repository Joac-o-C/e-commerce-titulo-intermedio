import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  OptimisticLockVersionMismatchError,
  Repository,
  type EntityManager,
  type SelectQueryBuilder,
} from 'typeorm';
import { CategoriesService } from './categories/categories.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { CreateVariantDto, UpdateVariantDto } from './dto/create-variant.dto.js';
import { QueryAdminProductsDto } from './dto/query-admin-products.dto.js';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { Product } from './entities/product.entity.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { StockMovement, StockMovementType } from './entities/stock-movement.entity.js';
import { activeVariantsInOrder, isPurchasable } from './purchasable.js';
import { STORAGE_SERVICE, type StorageService } from '../../providers/storage/storage.interface.js';

/** CU-18: umbral de stock bajo por defecto cuando el producto no fija uno propio. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const CATALOG_PAGE_SIZE = 24;

/**
 * Producto tal como lo ve el ABM (CU-16): `variants` son las vigentes en su
 * orden, e `inactiveVariants` las dadas de baja, que se pueden reactivar.
 */
export type AdminProductView = Product & { inactiveVariants: ProductVariant[] };

export interface ProductAvailability {
  stockAvailable: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

/**
 * CU-04, CU-09 (catálogo público) y CU-16 (ABM admin). Se exporta del
 * módulo `products` para que `cart`/`orders` (Fase 3+) revaliden el
 * catálogo en servidor sin acceder directamente a los repositorios.
 */
@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly categoriesService: CategoriesService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
  ) {}

  /** @usecase CU-04 Filtrar productos */
  async findPublished(query: QueryProductsDto) {
    const offset = query.offset ?? 0;
    // CU-04: "al elegir una categoría se incluyen automáticamente todos los
    // productos de sus subcategorías".
    const categoryIds = query.categoryIds?.length
      ? await this.categoriesService.findDescendantIds(query.categoryIds)
      : query.categoryIds;
    const base = this.buildPublicQuery(query, categoryIds);

    const total = await base.clone().getCount();

    const idsQb = base
      .clone()
      .select('product.id', 'id')
      .offset(offset)
      .limit(CATALOG_PAGE_SIZE);
    this.applyOrder(idsQb, query.sort, query.inStockOnly === true);

    const rows = await idsQb.getRawMany<{ id: string }>();
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      return { items: [], total, hasMore: false };
    }

    const products = await this.productRepo.find({
      where: { id: In(ids) },
      relations: { categories: true, variants: true, images: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = ids.map((id) => byId.get(id)).filter((p): p is Product => !!p);

    return {
      items: items.map((p) => this.toPublicSummary(p)),
      total,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * @usecase CU-09 Ver detalle de producto
   */
  async findPublicDetail(id: string) {
    const product = await this.productRepo.findOne({
      where: { id, isPublished: true, isActive: true },
      relations: { categories: true, variants: true, images: true },
    });
    // CU-09 (flujo 2a): producto inexistente o no publicado.
    if (!product) throw new NotFoundException('Producto no disponible');

    const related = await this.findRelated(product);
    return {
      ...this.toPublicSummary(product),
      description: product.description,
      variants: activeVariantsInOrder(product.variants).map((v) => ({
        id: v.id,
        sku: v.sku,
        attributes: v.attributes,
        ...this.getAvailability(product, v),
      })),
      images: [...product.images].sort((a, b) => a.order - b.order),
      relatedProducts: related.map((p) => this.toPublicSummary(p)),
    };
  }

  /**
   * CU-16 (alta). Crea el producto, sus imágenes (subidas al Servicio de
   * Almacenamiento) y sus variantes; si no se cargó ninguna variante, crea
   * una implícita (CU-09, flujo 3a).
   * @usecase CU-16 ABM de productos
   */
  async create(dto: CreateProductDto, images: Express.Multer.File[]): Promise<AdminProductView> {
    if (!images || images.length === 0) {
      // CU-16 (flujo 6a): al menos una imagen es obligatoria.
      throw new BadRequestException('El producto debe tener al menos una imagen');
    }
    const categories = await this.resolveCategoriesOrFail(dto.categoryIds);
    const variantsInput = dto.variants && dto.variants.length > 0 ? dto.variants : [this.buildImplicitVariant(dto.name)];
    await this.assertSkusAvailable(variantsInput.map((v) => v.sku));

    // Las imágenes se suben antes de abrir la transacción; si algo falla
    // después (ej. SKU duplicado por una carrera de dos altas concurrentes),
    // se borran del disco para no dejar archivos huérfanos.
    const uploaded = await Promise.all(images.map((file) => this.storageService.upload(file, 'products')));
    try {
      return await this.dataSource.transaction(async (manager) => {
        const product = manager.create(Product, {
          name: dto.name,
          description: dto.description,
          price: dto.price.toFixed(2),
          brand: dto.brand,
          isPublished: dto.isPublished ?? false,
          lowStockThreshold: dto.lowStockThreshold,
          categories,
        });
        const saved = await manager.save(Product, product);

        const imageEntities = uploaded.map((result, index) =>
          manager.create(ProductImage, { productId: saved.id, url: result.url, order: index }),
        );
        await manager.save(ProductImage, imageEntities);

        const variantEntities = variantsInput.map((v, position) =>
          manager.create(ProductVariant, {
            productId: saved.id,
            sku: v.sku,
            attributes: v.attributes ?? {},
            stockTotal: v.stockTotal,
            position,
          }),
        );
        await this.saveVariantsOrFail(manager, variantEntities);

        return this.toAdminView((await manager.findOne(Product, {
          where: { id: saved.id },
          relations: { categories: true, variants: true, images: true },
        }))!);
      });
    } catch (err) {
      await Promise.all(uploaded.map((u) => this.storageService.remove(u.url)));
      throw err;
    }
  }

  /**
   * CU-16 (flujo 3a: editar). Las imágenes nuevas se agregan a las
   * existentes. Si viene la lista de variantes, se sincroniza en su lugar
   * (ver `syncVariants`): nunca se borran filas, porque pedidos,
   * devoluciones e historial de stock las referencian.
   * @usecase CU-16 ABM de productos
   * @usecase-includes CU-18 (ajuste de stock desde la edición)
   */
  async update(id: string, dto: UpdateProductDto, newImages: Express.Multer.File[] = [], actorId: string | null = null): Promise<AdminProductView> {
    const product = await this.findOneForAdminOrFail(id);

    // CU-16 (flujo 2a): edición concurrente.
    if (product.version !== dto.version) {
      throw new ConflictException(
        'El producto fue modificado por otro administrador; recargá los datos e intentá de nuevo',
      );
    }

    if (dto.categoryIds) {
      product.categories = await this.resolveCategoriesOrFail(dto.categoryIds);
    }
    if (dto.name !== undefined) product.name = dto.name;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.price !== undefined) product.price = dto.price.toFixed(2);
    if (dto.brand !== undefined) product.brand = dto.brand;
    if (dto.isPublished !== undefined) product.isPublished = dto.isPublished;
    if (dto.lowStockThreshold !== undefined) product.lowStockThreshold = dto.lowStockThreshold;

    return this.dataSource.transaction(async (manager) => {
      let saved: Product;
      try {
        saved = await manager.save(Product, product);
      } catch (err) {
        // Salvaguarda adicional si TypeORM detecta el mismatch a nivel de
        // fila (nuestro chequeo manual de arriba ya cubre el caso normal);
        // cualquier otro error se deja propagar tal cual, no se enmascara.
        if (err instanceof OptimisticLockVersionMismatchError) {
          throw new ConflictException(
            'El producto fue modificado por otro administrador; recargá los datos e intentá de nuevo',
          );
        }
        throw err;
      }

      if (dto.variants && dto.variants.length > 0) {
        await this.syncVariants(manager, id, dto.variants, actorId);
      }

      if (newImages.length > 0) {
        const existingCount = await manager.count(ProductImage, { where: { productId: id } });
        const uploaded = await Promise.all(newImages.map((file) => this.storageService.upload(file, 'products')));
        const imageEntities = uploaded.map((result, index) =>
          manager.create(ProductImage, { productId: id, url: result.url, order: existingCount + index }),
        );
        await manager.save(ProductImage, imageEntities);
      }

      return this.toAdminView((await manager.findOne(Product, {
        where: { id: saved.id },
        relations: { categories: true, variants: true, images: true },
      }))!);
    });
  }

  /**
   * CU-16 (flujo 3a): lleva las variantes del producto a la lista editada.
   * - Con `id`: se actualiza en su lugar (SKU, atributos, posición). Si el
   *   stock total cambia, queda un movimiento "ajuste" con el Administrador
   *   como actor, con la misma regla que CU-18 (flujo 6b): nunca por debajo
   *   de lo reservado.
   * - Sin `id`: variante nueva, con su stock inicial (igual que en el alta).
   * - Las vigentes que no vienen: baja lógica, salvo que tengan stock
   *   reservado por pedidos en curso (mismo criterio que la baja de producto).
   * - Una dada de baja que vuelve a venir en la lista (con su `id`) se
   *   reactiva, conservando su historial y su SKU.
   * La posición de cada una es su índice en la lista.
   * @usecase CU-16 ABM de productos
   */
  private async syncVariants(
    manager: EntityManager,
    productId: string,
    input: UpdateVariantDto[],
    actorId: string | null,
  ): Promise<void> {
    const current = await manager.find(ProductVariant, {
      where: { productId },
      lock: { mode: 'pessimistic_write' },
    });
    const byId = new Map(current.map((v) => [v.id, v]));

    const keptIds = input.flatMap((v) => (v.id ? [v.id] : []));
    if (new Set(keptIds).size !== keptIds.length) {
      throw new BadRequestException('Una variante aparece repetida en la lista');
    }
    if (keptIds.some((variantId) => !byId.has(variantId))) {
      throw new ConflictException('Una de las variantes ya no existe; recargá los datos e intentá de nuevo');
    }
    await this.assertSkusAvailable(
      input.map((v) => v.sku),
      productId,
    );
    // Nueva con el SKU de una dada de baja del mismo producto: se reactiva
    // esa (desde "Dadas de baja"), no se crea otra.
    const newSkus = new Set(input.filter((v) => !v.id).map((v) => v.sku));
    const clash = current.find((v) => !v.isActive && newSkus.has(v.sku));
    if (clash) {
      throw new BadRequestException(
        `El SKU "${clash.sku}" es de una variante dada de baja: reactivala desde "Dadas de baja" en vez de crear una nueva`,
      );
    }

    const removed = current.filter((v) => v.isActive && !keptIds.includes(v.id));
    const reserved = removed.find((v) => v.stockReserved > 0);
    if (reserved) {
      throw new BadRequestException(
        `No se puede quitar la variante ${this.variantLabel(reserved)}: tiene stock reservado por pedidos en curso`,
      );
    }
    for (const variant of removed) variant.isActive = false;

    const movements: StockMovement[] = [];
    const upserts = input.map((v, position) => {
      const existing = v.id ? byId.get(v.id) : undefined;
      if (!existing) {
        return manager.create(ProductVariant, {
          productId,
          sku: v.sku,
          attributes: v.attributes ?? {},
          stockTotal: v.stockTotal,
          position,
        });
      }
      if (v.stockTotal !== existing.stockTotal) {
        if (v.stockTotal < existing.stockReserved) {
          throw new BadRequestException(
            `El stock total de la variante ${this.variantLabel(existing)} (${v.stockTotal}) no puede quedar por debajo del reservado (${existing.stockReserved})`,
          );
        }
        movements.push(
          manager.create(StockMovement, {
            variantId: existing.id,
            type: StockMovementType.AJUSTE,
            quantity: v.stockTotal,
            resultingStockTotal: v.stockTotal,
            reason: 'Ajuste desde la edición del producto',
            actorId,
          }),
        );
      }
      Object.assign(existing, { sku: v.sku, attributes: v.attributes ?? {}, stockTotal: v.stockTotal, position, isActive: true });
      return existing;
    });

    // Salvaguarda del UNIQUE de `sku` (carreras): saveVariantsOrFail la traduce a un 400.
    await this.saveVariantsOrFail(manager, [...removed, ...upserts]);
    if (movements.length > 0) await manager.save(StockMovement, movements);
  }

  private variantLabel(variant: ProductVariant): string {
    const attributes = Object.values(variant.attributes).join(' / ');
    return attributes ? `"${attributes}" (${variant.sku})` : `"${variant.sku}"`;
  }

  private toAdminView(product: Product): AdminProductView {
    const all = product.variants;
    product.variants = activeVariantsInOrder(all);
    return Object.assign(product, {
      inactiveVariants: all.filter((v) => !v.isActive).sort((a, b) => a.sku.localeCompare(b.sku)),
    });
  }

  /**
   * @usecase CU-16 ABM de productos (flujo 3b: publicar/despublicar)
   */
  async setPublished(id: string, isPublished: boolean): Promise<Product> {
    const product = await this.findOneForAdminOrFail(id);
    product.isPublished = isPublished;
    return this.productRepo.save(product);
  }

  /**
   * CU-16 (flujo 3c): baja lógica, bloqueada si alguna variante tiene stock
   * reservado por pedidos en curso (3c-1).
   * @usecase CU-16 ABM de productos
   */
  async remove(id: string): Promise<void> {
    const product = await this.findOneForAdminOrFail(id);
    const hasReservedStock = product.variants.some((v) => v.stockReserved > 0);
    if (hasReservedStock) {
      throw new BadRequestException(
        'No se puede dar de baja: tiene stock reservado por pedidos en curso. Podés despublicarlo.',
      );
    }
    product.isActive = false;
    await this.productRepo.save(product);
  }

  /** @usecase CU-16 ABM de productos (paso 2: listado admin) */
  async findAllForAdmin(query: QueryAdminProductsDto) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    // Filtros sin joins que multipliquen filas (necesario para que
    // getCount() no infle el total por el cruce con variantes/imágenes).
    const filtered = this.productRepo.createQueryBuilder('product').where('product.isActive = true');
    if (query.search) {
      filtered.andWhere('(product.name ILIKE :search OR product.brand ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.categoryId) {
      // Mismo criterio que el catálogo público: elegir una categoría
      // también incluye los productos de sus subcategorías.
      const categoryIds = await this.categoriesService.findDescendantIds([query.categoryId]);
      filtered.andWhere(
        'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = product.id AND pc.category_id IN (:...categoryIds))',
        { categoryIds },
      );
    }
    if (query.isPublished !== undefined) {
      filtered.andWhere('product.isPublished = :isPublished', { isPublished: query.isPublished });
    }

    const total = await filtered.clone().getCount();
    const idRows = await filtered
      .clone()
      .select('product.id', 'id')
      .orderBy('product.createdAt', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany<{ id: string }>();
    const ids = idRows.map((r) => r.id);
    if (ids.length === 0) return { items: [], total, hasMore: false };

    const items = await this.productRepo.find({
      where: { id: In(ids) },
      relations: { categories: true, variants: true, images: true },
      order: { createdAt: 'DESC' },
    });

    return { items: items.map((p) => this.toAdminView(p)), total, hasMore: offset + items.length < total };
  }

  /**
   * Resuelve una variante para una compra (carrito, CU-02/11), validando
   * que el producto siga publicado/activo y la variante no esté dada de baja.
   */
  async resolveVariantForPurchase(variantId: string): Promise<{ product: Product; variant: ProductVariant }> {
    const variant = await this.variantRepo.findOne({ where: { id: variantId }, relations: { product: true } });
    if (!variant || !isPurchasable(variant.product, variant)) {
      throw new NotFoundException('La variante solicitada no está disponible');
    }
    return { product: variant.product, variant };
  }

  /**
   * Estado vigente en el catálogo de los productos de un pedido, para
   * revalidarlo antes de reintentar el pago (CU-03 flujo R, pasos 13-18).
   */
  async findCatalogState(productIds: string[]): Promise<Map<string, Pick<Product, 'isActive' | 'isPublished' | 'price'>>> {
    if (productIds.length === 0) return new Map();
    const products = await this.productRepo.find({
      select: { id: true, isActive: true, isPublished: true, price: true },
      where: { id: In(productIds) },
    });
    return new Map(products.map((p) => [p.id, p]));
  }

  /** Variantes (de las pedidas) dadas de baja en CU-16, para la misma revalidación. */
  async findInactiveVariantIds(variantIds: string[]): Promise<Set<string>> {
    if (variantIds.length === 0) return new Set();
    const variants = await this.variantRepo.find({
      select: { id: true },
      where: { id: In(variantIds), isActive: false },
    });
    return new Set(variants.map((v) => v.id));
  }

  /**
   * CU-22 (flujo 10a): variantes entre las que el Administrador elige la
   * reposición de un cambio — las del mismo producto, con su disponible.
   * Sólo exige que el producto no esté dado de baja: despublicado se puede
   * seguir reponiendo lo que ya se vendió.
   */
  async findReplacementOptions(productIds: string[]) {
    if (productIds.length === 0) return new Map<string, { id: string; attributes: Record<string, string>; stockAvailable: number }[]>();
    const variants = await this.variantRepo.find({
      where: { productId: In(productIds), isActive: true, product: { isActive: true } },
      order: { position: 'ASC' },
    });
    const byProduct = new Map<string, { id: string; attributes: Record<string, string>; stockAvailable: number }[]>();
    for (const v of variants) {
      const list = byProduct.get(v.productId) ?? [];
      list.push({ id: v.id, attributes: v.attributes, stockAvailable: v.stockTotal - v.stockReserved });
      byProduct.set(v.productId, list);
    }
    return byProduct;
  }

  /** `categoryIds` ya viene expandido a subcategorías (ver findPublished). */
  private buildPublicQuery(query: QueryProductsDto, categoryIds: string[] | undefined) {
    const qb = this.productRepo
      .createQueryBuilder('product')
      .where('product.isPublished = true')
      .andWhere('product.isActive = true');

    if (query.search) {
      // CU-04: búsqueda por nombre, descripción, marca o SKU de variante.
      qb.andWhere(
        `(product.name ILIKE :search OR product.description ILIKE :search OR product.brand ILIKE :search
          OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = product.id AND pv.is_active AND pv.sku ILIKE :search))`,
        { search: `%${query.search}%` },
      );
    }
    if (categoryIds && categoryIds.length > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = product.id AND pc.category_id IN (:...categoryIds))`,
        { categoryIds },
      );
    }
    if (query.minPrice !== undefined) {
      qb.andWhere('product.price >= :minPrice', { minPrice: query.minPrice });
    }
    if (query.maxPrice !== undefined) {
      qb.andWhere('product.price <= :maxPrice', { maxPrice: query.maxPrice });
    }
    if (query.inStockOnly === true) {
      // CU-04 (paso 5): disponibilidad mayor a cero.
      qb.andWhere(this.stockAvailableExpr() + ' > 0');
    }
    return qb;
  }

  private applyOrder(qb: SelectQueryBuilder<Product>, sort: ProductSort | undefined, inStockOnly: boolean) {
    if (!inStockOnly) {
      // CU-04 (flujo 6a): sin el toggle de stock, los productos sin stock
      // se listan al final, marcados "sin stock".
      qb.addOrderBy(`(${this.stockAvailableExpr()} > 0)`, 'DESC');
    }
    switch (sort) {
      case 'precio_asc':
        qb.addOrderBy('product.price', 'ASC');
        break;
      case 'precio_desc':
        qb.addOrderBy('product.price', 'DESC');
        break;
      case 'nombre_asc':
        qb.addOrderBy('product.name', 'ASC');
        break;
      case 'nuevos':
      case 'mas_vendidos':
        // "más vendidos" no tiene datos de ventas hasta que exista `orders`
        // (Fase 4+); por ahora es un alias documentado de "más nuevos".
        qb.addOrderBy('product.createdAt', 'DESC');
        break;
      case 'relevancia':
      default:
        // Sin ranking de texto completo implementado: relevancia cae en
        // "más nuevos" como criterio determinístico razonable.
        qb.addOrderBy('product.createdAt', 'DESC');
        break;
    }
    qb.addOrderBy('product.id', 'ASC');
  }

  private stockAvailableExpr(): string {
    return '(SELECT COALESCE(SUM(v.stock_total - v.stock_reserved), 0) FROM product_variants v WHERE v.product_id = product.id AND v.is_active)';
  }

  private toPublicSummary(product: Product) {
    const totalAvailable = activeVariantsInOrder(product.variants).reduce((sum, v) => sum + v.stockAvailable, 0);
    const threshold = product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    return {
      id: product.id,
      name: product.name,
      price: product.price,
      brand: product.brand,
      stockAvailable: totalAvailable,
      isLowStock: totalAvailable > 0 && totalAvailable <= threshold,
      isOutOfStock: totalAvailable <= 0,
      mainImageUrl: [...product.images].sort((a, b) => a.order - b.order)[0]?.url ?? null,
      categories: product.categories.map((c) => ({ id: c.id, name: c.name })),
      createdAt: product.createdAt,
    };
  }

  private getAvailability(product: Product, variant: ProductVariant): ProductAvailability {
    const threshold = product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    return {
      stockAvailable: variant.stockAvailable,
      isLowStock: variant.stockAvailable > 0 && variant.stockAvailable <= threshold,
      isOutOfStock: variant.stockAvailable <= 0,
    };
  }

  private async findRelated(product: Product): Promise<Product[]> {
    const categoryIds = product.categories.map((c) => c.id);
    if (categoryIds.length === 0) return [];

    const subcategoryIds = product.categories.filter((c) => c.parentId !== null).map((c) => c.id);
    const primaryIds = subcategoryIds.length > 0 ? subcategoryIds : categoryIds;

    const related = await this.queryRelatedByCategories(primaryIds, product.id, [], 8);
    if (related.length < 8) {
      // CU-09: si no alcanzan por subcategoría, completa con la categoría.
      const parentIds = product.categories.filter((c) => c.parentId === null).map((c) => c.id);
      const fallbackIds = parentIds.length > 0 ? parentIds : categoryIds;
      const more = await this.queryRelatedByCategories(
        fallbackIds,
        product.id,
        related.map((p) => p.id),
        8 - related.length,
      );
      related.push(...more);
    }
    return related;
  }

  private async queryRelatedByCategories(
    categoryIds: string[],
    excludeId: string,
    excludeIds: string[],
    limit: number,
  ): Promise<Product[]> {
    if (categoryIds.length === 0 || limit <= 0) return [];
    const qb = this.productRepo
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.categories', 'category')
      .leftJoinAndSelect('product.images', 'image')
      .leftJoinAndSelect('product.variants', 'variant')
      .where('category.id IN (:...categoryIds)', { categoryIds })
      .andWhere('product.id != :excludeId', { excludeId })
      .andWhere('product.isPublished = true')
      .andWhere('product.isActive = true')
      .andWhere(this.stockAvailableExpr() + ' > 0');
    if (excludeIds.length > 0) {
      qb.andWhere('product.id NOT IN (:...excludeIds)', { excludeIds });
    }
    return qb.distinct(true).orderBy('product.createdAt', 'DESC').take(limit).getMany();
  }

  private buildImplicitVariant(productName: string): CreateVariantDto {
    const slug = productName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return { sku: `${slug || 'producto'}-${randomUUID().slice(0, 8)}`, stockTotal: 0, attributes: {} };
  }

  private async assertSkusAvailable(skus: string[], excludeProductId?: string): Promise<void> {
    const unique = new Set(skus);
    if (unique.size !== skus.length) {
      throw new BadRequestException('Los SKU de las variantes deben ser únicos entre sí');
    }
    const qb = this.variantRepo.createQueryBuilder('variant').where('variant.sku IN (:...skus)', { skus });
    if (excludeProductId) {
      qb.andWhere('variant.product_id != :excludeProductId', { excludeProductId });
    }
    const existing = await qb.getOne();
    if (existing) {
      throw new BadRequestException(`El SKU "${existing.sku}" ya está en uso`);
    }
  }

  private async resolveCategoriesOrFail(categoryIds: string[]) {
    const categories = await this.categoriesService.findByIds(categoryIds);
    // CU-16 (flujo 4a/8a): una categoría seleccionada ya no existe.
    if (categories.length !== new Set(categoryIds).size) {
      throw new BadRequestException('Alguna de las categorías seleccionadas ya no existe');
    }
    return categories;
  }

  /**
   * `assertSkusAvailable` es una verificación previa (TOCTOU): dos altas
   * concurrentes con el mismo SKU pueden pasarla ambas. Esta es la
   * salvaguarda real, apoyada en el `UNIQUE` de la columna `sku`.
   */
  private async saveVariantsOrFail(manager: EntityManager, variants: ProductVariant[]): Promise<void> {
    try {
      await manager.save(ProductVariant, variants);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new BadRequestException('Uno de los SKU ya está en uso');
      }
      throw err;
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
  }

  private async findOneForAdminOrFail(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id, isActive: true },
      relations: { categories: true, variants: true, images: true },
    });
    if (!product) throw new NotFoundException('El producto no existe');
    return product;
  }
}
