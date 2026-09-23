import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity.js';

/**
 * Categoría o subcategoría del catálogo (CU-17). El árbol tiene exactamente
 * dos niveles: una categoría de primer nivel (parent null) puede tener
 * subcategorías (parent apuntando a ella), pero una subcategoría nunca puede
 * ser padre de otra — esa regla se valida en el service, no acá. Bajas
 * siempre lógicas (isActive) para no romper la clasificación histórica de
 * productos ya vendidos.
 */
@Entity('categories')
// Índices únicos parciales creados a mano en AddCategoryNameUniqueness
// (CU-17: nombre único entre hermanos). Se declaran acá para que
// `migration:generate` no los vea como sobrantes e intente borrarlos.
@Index('UX_categories_name_top_level', ['name'], { unique: true, where: '"parent_id" IS NULL' })
@Index('UX_categories_name_per_parent', ['parentId', 'name'], { unique: true, where: '"parent_id" IS NOT NULL' })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description?: string | null;

  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Relation<Category> | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @OneToMany(() => Category, (category) => category.parent)
  children: Relation<Category>[];

  @Column({ default: 0 })
  order: number;

  // CU-17: una categoría oculta sigue existiendo pero no aparece en los
  // filtros del catálogo público (CU-04) ni en la ficha de producto (CU-09).
  @Column({ name: 'is_visible', default: true })
  isVisible: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Lado inverso de la N-N: la tabla intermedia (product_categories) se
  // declara en Product, que es el lado propietario de la relación.
  @ManyToMany(() => Product, (product) => product.categories)
  products: Relation<Product>[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
