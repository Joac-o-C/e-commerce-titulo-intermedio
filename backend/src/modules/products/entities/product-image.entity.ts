import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Product } from './product.entity.js';

/** Imagen de un producto (CU-16), subida vía el provider `storage`. */
@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, (product) => product.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Relation<Product>;

  @Column({ name: 'product_id' })
  productId: string;

  @Column()
  url: string;

  @Column({ default: 0 })
  order: number;

  @Column({ name: 'alt_text', type: 'varchar', nullable: true })
  altText?: string | null;
}
