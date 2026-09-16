import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

/**
 * CU-17 ABM de categorías y subcategorías. El árbol tiene exactamente dos
 * niveles: una subcategoría (con `parentId`) nunca puede ser padre de otra.
 */
@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  /** Árbol completo (incluye ocultas/inactivas) con conteo de productos, para el panel admin. */
  async findTreeForAdmin(): Promise<Array<Category & { productCount: number }>> {
    return this.buildTree(false);
  }

  /** Sólo categorías visibles y activas, para poblar los filtros de CU-04/CU-09. */
  async findPublicTree(): Promise<Array<Category & { productCount: number }>> {
    return this.buildTree(true);
  }

  private async buildTree(onlyVisible: boolean): Promise<Array<Category & { productCount: number }>> {
    const qb = this.categoryRepo
      .createQueryBuilder('category')
      .loadRelationIdAndMap('category.productIds', 'category.products', 'product', (q) =>
        q.andWhere('product.isActive = true'),
      )
      .orderBy('category.order', 'ASC');

    if (onlyVisible) {
      qb.where('category.isVisible = true').andWhere('category.isActive = true');
    } else {
      qb.where('category.isActive = true');
    }

    const raw = (await qb.getMany()) as Array<Category & { productIds: string[]; productCount: number }>;
    for (const category of raw) {
      category.productCount = category.productIds?.length ?? 0;
    }
    const all = raw;
    const byParent = new Map<string | null, Array<Category & { productCount: number }>>();
    for (const category of all) {
      const key = category.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(category);
    }
    for (const category of all) {
      category.children = byParent.get(category.id) ?? [];
    }
    return byParent.get(null) ?? [];
  }

  /**
   * @usecase CU-17 ABM de categorías
   */
  async create(dto: CreateCategoryDto): Promise<Category> {
    const parent = await this.resolveParentOrFail(dto.parentId);
    await this.assertNameNotDuplicated(dto.name, parent?.id ?? null);

    const category = this.categoryRepo.create({
      name: dto.name,
      description: dto.description,
      parentId: parent?.id ?? null,
      order: dto.order ?? 0,
      isVisible: dto.isVisible ?? true,
    });
    return this.saveOrFailOnDuplicateName(category);
  }

  /**
   * CU-17 (flujo 3a/3b): edición, incluida la reubicación de padre.
   * @usecase CU-17 ABM de categorías
   */
  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOneOrFail(id);

    if (dto.parentId !== undefined && dto.parentId !== category.parentId) {
      // CU-17 (flujo 3b): reubicar. Una categoría con subcategorías propias
      // no puede pasar a tener padre (dejaría de ser de primer nivel).
      if (dto.parentId && (category.children?.length ?? (await this.countChildren(id))) > 0) {
        throw new BadRequestException(
          'No se puede convertir en subcategoría a una categoría que ya tiene subcategorías',
        );
      }
      const parent = await this.resolveParentOrFail(dto.parentId, id);
      category.parentId = parent?.id ?? null;
    }

    if (dto.name !== undefined && dto.name !== category.name) {
      await this.assertNameNotDuplicated(dto.name, category.parentId, id);
      category.name = dto.name;
    }
    if (dto.description !== undefined) category.description = dto.description;
    if (dto.order !== undefined) category.order = dto.order;
    if (dto.isVisible !== undefined) category.isVisible = dto.isVisible;

    return this.saveOrFailOnDuplicateName(category);
  }

  /**
   * `assertNameNotDuplicated` es una verificación previa (TOCTOU): dos altas
   * concurrentes con el mismo nombre y padre pueden pasarla ambas. Esta es
   * la salvaguarda real, apoyada en los índices únicos parciales de la
   * migración `AddCategoryNameUniqueness`.
   */
  private async saveOrFailOnDuplicateName(category: Category): Promise<Category> {
    try {
      return await this.categoryRepo.save(category);
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
        throw new BadRequestException('Ya existe una categoría con ese nombre en el mismo nivel');
      }
      throw err;
    }
  }

  /**
   * CU-17 (flujo 3c): baja lógica, bloqueada si tiene subcategorías o
   * productos activos asociados.
   * @usecase CU-17 ABM de categorías
   */
  async remove(id: string): Promise<void> {
    const category = await this.findOneOrFail(id);

    const childrenCount = await this.countChildren(id);
    if (childrenCount > 0) {
      // CU-17 (flujo 3c-2)
      throw new BadRequestException(
        `No se puede dar de baja: tiene ${childrenCount} subcategoría(s) asociada(s)`,
      );
    }

    const productCount = await this.categoryRepo
      .createQueryBuilder('category')
      .innerJoin('category.products', 'product', 'product.isActive = true')
      .where('category.id = :id', { id })
      .getCount();
    if (productCount > 0) {
      // CU-17 (flujo 3c-1)
      throw new BadRequestException(
        `No se puede dar de baja: tiene ${productCount} producto(s) activo(s) asociado(s)`,
      );
    }

    category.isActive = false;
    await this.categoryRepo.save(category);
  }

  /**
   * Usado por ProductsService para expandir una categoría padre a sus hijos
   * (CU-04: "al elegir una categoría se incluyen automáticamente todos los
   * productos de sus subcategorías"). Sólo hace falta un nivel de
   * profundidad porque el árbol tiene exactamente dos niveles.
   */
  async findDescendantIds(categoryIds: string[]): Promise<string[]> {
    if (categoryIds.length === 0) return [];
    const children = await this.categoryRepo
      .createQueryBuilder('category')
      .where('category.parent_id IN (:...ids)', { ids: categoryIds })
      .getMany();
    return [...new Set([...categoryIds, ...children.map((c) => c.id)])];
  }

  async findByIds(ids: string[]): Promise<Category[]> {
    if (ids.length === 0) return [];
    return this.categoryRepo
      .createQueryBuilder('category')
      .whereInIds(ids)
      .andWhere('category.isActive = true')
      .getMany();
  }

  private async countChildren(id: string): Promise<number> {
    return this.categoryRepo.count({ where: { parentId: id, isActive: true } });
  }

  private async resolveParentOrFail(
    parentId: string | undefined,
    selfId?: string,
  ): Promise<Category | null> {
    if (!parentId) return null;
    if (parentId === selfId) {
      throw new BadRequestException('Una categoría no puede ser padre de sí misma');
    }
    const parent = await this.categoryRepo.findOne({ where: { id: parentId, isActive: true } });
    if (!parent) {
      throw new BadRequestException('La categoría padre indicada no existe');
    }
    // CU-17 (flujo 6b): la jerarquía tiene sólo dos niveles.
    if (parent.parentId !== null) {
      throw new BadRequestException('La categoría padre no puede ser, a su vez, una subcategoría');
    }
    return parent;
  }

  private async assertNameNotDuplicated(
    name: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.categoryRepo
      .createQueryBuilder('category')
      .where('category.name = :name', { name })
      .andWhere(parentId === null ? 'category.parent_id IS NULL' : 'category.parent_id = :parentId', {
        parentId,
      });
    if (excludeId) qb.andWhere('category.id != :excludeId', { excludeId });
    const existing = await qb.getOne();
    if (existing) {
      // CU-17 (flujo 6a)
      throw new BadRequestException('Ya existe una categoría con ese nombre en el mismo nivel');
    }
  }

  private async findOneOrFail(id: string): Promise<Category> {
    const category = await this.categoryRepo.findOne({ where: { id, isActive: true } });
    if (!category) throw new NotFoundException('La categoría no existe');
    return category;
  }
}
