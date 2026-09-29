import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Método de envío (CU-03 pasos 7-9). La ficha fija que "el costo de envío
 * es fijo por método de envío y lo configura el Administrador": no depende
 * de la dirección, así que todos los métodos activos están disponibles
 * para cualquier dirección. No estaba en el modelo de datos original del
 * plan; se agregó al arrancar la Fase 4 (decisión con el usuario), con
 * métodos sembrados por migración. El ABM admin llegó en la Fase 6
 * (alcance extra pedido por el usuario).
 */
/**
 * Si el Cliente recibe el pedido en su dirección o lo retira (local o
 * sucursal del correo). Lo usa el correo de confirmación (CU-05 paso 9);
 * agregado en la Fase 7, decisión con el usuario.
 */
export enum ShippingMethodType {
  DOMICILIO = 'domicilio',
  RETIRO = 'retiro',
}

@Entity('shipping_methods')
export class ShippingMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Único sin distinguir mayúsculas (decisión de la Fase 6). El índice es
   * sobre `lower(name)`, que TypeORM no sabe declarar: se crea a mano en la
   * migración y `synchronize: false` evita que `migration:generate` lo borre.
   */
  @Index('UX_shipping_methods_name_lower', { synchronize: false })
  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cost: string;

  @Column({
    type: 'enum',
    enum: ShippingMethodType,
    enumName: 'shipping_method_type',
    default: ShippingMethodType.DOMICILIO,
  })
  type: ShippingMethodType;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
