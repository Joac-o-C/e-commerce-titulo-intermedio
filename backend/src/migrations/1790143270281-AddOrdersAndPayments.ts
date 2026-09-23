import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Fase 4 (CU-03/CU-05): pedidos, pagos, auditoría de pagos y métodos de envío.
 *
 * Retocada a mano sobre lo generado:
 * - El enum compartido `order_status` (orders.status y las dos columnas de
 *   order_status_history) TypeORM lo creaba dos veces y lo dropeaba antes de
 *   dropear la segunda tabla que lo usa: se deja un solo CREATE/DROP.
 * - Seed de los métodos de envío (sin ABM admin todavía, ver ShippingMethod).
 * - `carts`: la UNIQUE(user_id) pasa a índice único parcial sobre carritos
 *   activos (el carrito asociado a un pedido queda como registro, CU-03).
 */

export class AddOrdersAndPayments1790143270281 implements MigrationInterface {
    name = 'AddOrdersAndPayments1790143270281'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."order_status" AS ENUM('pendiente_pago', 'pago_pendiente_acreditacion', 'pago_rechazado', 'pagado', 'en_preparacion', 'despachado', 'entregado', 'cancelado', 'devuelto')`);
        await queryRunner.query(`CREATE TABLE "order_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "from_status" "public"."order_status", "to_status" "public"."order_status" NOT NULL, "actor_id" uuid, "reason" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e6c66d853f155531985fc4f6ec8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "cart_id" uuid, "status" "public"."order_status" NOT NULL, "subtotal" numeric(10,2) NOT NULL, "shipping_cost" numeric(10,2) NOT NULL, "total" numeric(10,2) NOT NULL, "shipping_method_snapshot" jsonb NOT NULL, "shipping_address_snapshot" jsonb NOT NULL, "stock_reservation_active" boolean NOT NULL DEFAULT false, "reservation_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "payment_preference_id" character varying, "internal_notes" text, "tracking_carrier" character varying, "tracking_number" character varying, "dispatched_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a07403023c1dbc2d84020409b8" ON "orders"  ("status", "reservation_expires_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_fbfc1475fc6797244d160068cb" ON "orders"  ("user_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "product_id" uuid NOT NULL, "variant_id" uuid NOT NULL, "product_name_snapshot" character varying NOT NULL, "variant_attributes_snapshot" jsonb NOT NULL DEFAULT '{}', "quantity" integer NOT NULL, "unit_price_snapshot" numeric(10,2) NOT NULL, "subtotal" numeric(10,2) NOT NULL, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "shipping_methods" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, "cost" numeric(10,2) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5bee9dd62a8b72d6d9caabd63cf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."payment_audit_logs_event_type_enum" AS ENUM('notificacion_invalida', 'pedido_inexistente', 'pasarela_no_disponible', 'notificacion_duplicada', 'discrepancia', 'pago_procesado')`);
        await queryRunner.query(`CREATE TABLE "payment_audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid, "external_payment_id" character varying, "event_type" "public"."payment_audit_logs_event_type_enum" NOT NULL, "payload" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1f3c2d028e1ec2c6e889bf3e4b6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2343443b96406500de6ecfb17e" ON "payment_audit_logs"  ("order_id", "created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."payment_status" AS ENUM('pendiente', 'aprobado', 'rechazado', 'pendiente_acreditacion', 'cancelado')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "provider" character varying NOT NULL DEFAULT 'mercadopago', "external_payment_id" character varying NOT NULL, "status" "public"."payment_status" NOT NULL, "amount" numeric(10,2) NOT NULL, "installments" integer, "method" character varying, "raw_payload" jsonb, "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3b60ea4178515aa90d7d7b59917" UNIQUE ("external_payment_id"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TYPE "public"."stock_movements_type_enum" ADD VALUE 'venta'`);
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea"`);
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "UQ_2ec1c94a977b940d85a4f498aea"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_carts_user_active" ON "carts"  ("user_id") WHERE "status" = 'activo'`);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_status_history" ADD CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_status_history" ADD CONSTRAINT "FK_bc9c2854c4f4988218d7cb230ef" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_a922b820eeef29ac1c6800e826a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_db2d0ea722e16e0fe8ab3bce111" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_b2f7b823a21562eeca20e72b006" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

        // Métodos de envío iniciales (CU-03 pasos 7-9): costo fijo por método.
        await queryRunner.query(`INSERT INTO "shipping_methods" ("name", "description", "cost") VALUES
            ('Envío estándar', 'Entrega a domicilio en 5 a 7 días hábiles', 4500.00),
            ('Envío express', 'Entrega a domicilio en 24 a 48 h hábiles', 8900.00),
            ('Retiro en sucursal del correo', 'Retirás en la sucursal más cercana a la dirección, en 3 a 5 días hábiles', 2500.00)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_b2f7b823a21562eeca20e72b006"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_db2d0ea722e16e0fe8ab3bce111"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_a922b820eeef29ac1c6800e826a"`);
        await queryRunner.query(`ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_bc9c2854c4f4988218d7cb230ef"`);
        await queryRunner.query(`ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c"`);
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_carts_user_active"`);
        // Los carritos asociados a pedidos sólo existen por esta migración (y
        // sus pedidos se borran más abajo): sin quitarlos, la UNIQUE(user_id)
        // original no se puede restaurar para un cliente que ya compró.
        await queryRunner.query(`DELETE FROM "carts" WHERE "status" = 'asociado_a_pedido'`);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "UQ_2ec1c94a977b940d85a4f498aea" UNIQUE ("user_id")`);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        // Las ventas registradas pertenecen a pedidos que este down() borra;
        // sin quitarlas, el enum no puede volver a su versión sin 'venta'.
        await queryRunner.query(`DELETE FROM "stock_movements" WHERE "type" = 'venta'`);
        await queryRunner.query(`CREATE TYPE "public"."stock_movements_type_enum_old" AS ENUM('reposicion', 'ajuste', 'merma', 'devolucion')`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ALTER COLUMN "type" TYPE "public"."stock_movements_type_enum_old" USING "type"::"text"::"public"."stock_movements_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."stock_movements_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."stock_movements_type_enum_old" RENAME TO "stock_movements_type_enum"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payment_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2343443b96406500de6ecfb17e"`);
        await queryRunner.query(`DROP TABLE "payment_audit_logs"`);
        await queryRunner.query(`DROP TYPE "public"."payment_audit_logs_event_type_enum"`);
        await queryRunner.query(`DROP TABLE "shipping_methods"`);
        await queryRunner.query(`DROP TABLE "order_items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fbfc1475fc6797244d160068cb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a07403023c1dbc2d84020409b8"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`DROP TABLE "order_status_history"`);
        await queryRunner.query(`DROP TYPE "public"."order_status"`);
    }

}
