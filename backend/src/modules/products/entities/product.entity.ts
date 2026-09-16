import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Category } from './category.entity.js';
import { ProductImage } from './product-image.entity.js';
import { ProductVariant } from './product-variant.entity.js';

/**
 * Producto del catálogo (CU-16). El precio es único por producto: las
 * variantes (CU-09/CU-18) sólo se diferencian por SKU y stock. Bajas siempre
 * lógicas (isActive) para preservar la integridad referencial con `orders`,
 * `cart` y las solicitudes de posventa. `version` sostiene la concurrencia
 * optimista de CU-16 (flujo 2a): TypeORM lanza
 * OptimisticLockVersionMismatchError en `.save()` si otro Administrador ya
 * modificó el producto.
 */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string;

  @Column({ type: 'varchar', nullable: true })
  brand?: string | null;

  // CU-16 (flujo 3b): publicar/despublicar es independiente de la baja
  // lógica (isActive) — un producto despublicado se conserva.
  @Column({ name: 'is_published', default: false })
  isPublished: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // CU-18: si es null, rige el valor global por defecto de 5 unidades.
  @Column({ name: 'low_stock_threshold', type: 'int', nullable: true })
  lowStockThreshold: number | null;

  @ManyToMany(() => Category, (category) => category.products)
  @JoinTable({
    name: 'product_categories',
    joinColumn: { name: 'product_id' },
    inverseJoinColumn: { name: 'category_id' },
  })
  categories: Relation<Category>[];

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants: Relation<ProductVariant>[];

  @OneToMany(() => ProductImage, (image) => image.product)
  images: Relation<ProductImage>[];

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
