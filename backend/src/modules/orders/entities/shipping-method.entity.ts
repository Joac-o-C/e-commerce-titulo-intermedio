import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Método de envío (CU-03 pasos 7-9). La ficha fija que "el costo de envío
 * es fijo por método de envío y lo configura el Administrador": no depende
 * de la dirección, así que todos los métodos activos están disponibles
 * para cualquier dirección. No estaba en el modelo de datos original del
 * plan; se agregó al arrancar la Fase 4 (decisión con el usuario), con
 * métodos sembrados por migración y sin ABM admin todavía.
 */
@Entity('shipping_methods')
export class ShippingMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cost: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
