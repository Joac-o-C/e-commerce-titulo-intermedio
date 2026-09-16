import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity.js';
import { StockMovement } from './stock-movement.entity.js';

/**
 * Variante de un producto (p. ej. talle/color), CU-16/CU-18. El stock se
 * lleva siempre por variante — si el Administrador no cargó ninguna, CU-16
 * crea una variante implícita única al persistir el producto (CU-09,
 * flujo 3a: "si el producto no tiene variantes, el stock es el del
 * producto"). `stockAvailable` (total - reservado) no se persiste: se
 * calcula al leer, porque `stockReserved` lo mueven CU-03/05/14/19/22, no
 * este módulo.
 */
@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Relation<Product>;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ unique: true })
  sku: string;

  @Column({ type: 'jsonb', default: {} })
  attributes: Record<string, string>;

  @Column({ name: 'stock_total', type: 'int', default: 0 })
  stockTotal: number;

  @Column({ name: 'stock_reserved', type: 'int', default: 0 })
  stockReserved: number;

  @OneToMany(() => StockMovement, (movement) => movement.variant)
  movements: Relation<StockMovement>[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  get stockAvailable(): number {
    return this.stockTotal - this.stockReserved;
  }
}
