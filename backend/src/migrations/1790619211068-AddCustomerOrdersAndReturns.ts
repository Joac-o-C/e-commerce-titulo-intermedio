import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerOrdersAndReturns1790619211068 implements MigrationInterface {
    name = 'AddCustomerOrdersAndReturns1790619211068'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "return_request_photos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "return_request_id" uuid NOT NULL, "url" character varying NOT NULL, "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_83575ac36a8bfa51d0d67ccbfc8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."return_request_status" AS ENUM('solicitada', 'aprobada', 'rechazada', 'resuelta')`);
        await queryRunner.query(`CREATE TYPE "public"."return_request_type" AS ENUM('cambio', 'devolucion')`);
        await queryRunner.query(`CREATE TABLE "return_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "request_number" SERIAL NOT NULL, "order_id" uuid NOT NULL, "status" "public"."return_request_status" NOT NULL, "type" "public"."return_request_type" NOT NULL, "reason" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resolved_at" TIMESTAMP WITH TIME ZONE, "resolved_by_user_id" uuid, "resolution_note" text, CONSTRAINT "UQ_5ccbf695a4f1764ff8d4e580e19" UNIQUE ("request_number"), CONSTRAINT "PK_38714de8942bd9bc3a450a06889" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b15a2c75b0a0d3585fe62dd217" ON "return_requests"  ("status", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_c7f39dfc32be2b7be25c139ba0" ON "return_requests"  ("order_id") `);
        await queryRunner.query(`CREATE TABLE "return_request_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "return_request_id" uuid NOT NULL, "order_item_id" uuid NOT NULL, "quantity_requested" integer NOT NULL, "quantity_approved" integer, CONSTRAINT "PK_4772cac6bc616ee08a622d9b16b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7a5e16ec9147bef173435f1bf2" ON "return_request_items"  ("order_item_id") `);
        await queryRunner.query(`CREATE TYPE "public"."refund_status" AS ENUM('en_tramite', 'reembolsado', 'rechazado', 'pendiente_de_gestion')`);
        await queryRunner.query(`CREATE TYPE "public"."refund_origin" AS ENUM('CU-14', 'CU-19', 'CU-22')`);
        await queryRunner.query(`CREATE TABLE "refunds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "payment_id" uuid NOT NULL, "amount" numeric(10,2) NOT NULL, "status" "public"."refund_status" NOT NULL, "external_refund_id" character varying, "origin_cu" "public"."refund_origin" NOT NULL, "reason" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resolved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_5106efb01eeda7e49a78b869738" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_55dcf88525a9b0a64d8445f827" ON "refunds"  ("order_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "orders" ADD "order_number" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "paid_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "delivered_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD "stock_committed" boolean NOT NULL DEFAULT false`);
        // Backfill a mano (no lo genera TypeORM):
        // - order_number: SERIAL numera las filas existentes en orden físico;
        //   se renumeran por fecha de alta y se ajusta la secuencia.
        await queryRunner.query(`
            UPDATE "orders" o SET "order_number" = n.rn
            FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS rn FROM "orders") n
            WHERE o."id" = n."id"`);
        // La UNIQUE va después de renumerar: se verifica fila por fila, no al final del UPDATE.
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "UQ_75eba1c6b1a66b09f2a97e6927b" UNIQUE ("order_number")`);
        await queryRunner.query(`SELECT setval(pg_get_serial_sequence('orders', 'order_number'), COALESCE((SELECT MAX("order_number") FROM "orders"), 0) + 1, false)`);
        // - paid_at: última transición a "pagado" del historial.
        await queryRunner.query(`
            UPDATE "orders" o SET "paid_at" = h.at
            FROM (SELECT "order_id", MAX("created_at") AS at FROM "order_status_history" WHERE "to_status" = 'pagado' GROUP BY "order_id") h
            WHERE o."id" = h."order_id"`);
        // - delivered_at: última transición a "entregado" (sin esto, un pedido
        //   ya entregado nunca podría pedir posventa: CU-15 cuenta desde acá).
        await queryRunner.query(`
            UPDATE "orders" o SET "delivered_at" = h.at
            FROM (SELECT "order_id", MAX("created_at") AS at FROM "order_status_history" WHERE "to_status" = 'entregado' GROUP BY "order_id") h
            WHERE o."id" = h."order_id"`);
        // - stock_committed: los ítems con su movimiento de venta (CU-05 7.a);
        //   los del faltante de 7a-1 no tienen movimiento y quedan en false.
        await queryRunner.query(`
            UPDATE "order_items" i SET "stock_committed" = true
            WHERE EXISTS (
                SELECT 1 FROM "stock_movements" m
                WHERE m."type" = 'venta' AND m."variant_id" = i."variant_id"
                  AND m."reason" = 'Venta — pedido ' || i."order_id")`);
        await queryRunner.query(`ALTER TYPE "public"."stock_movements_type_enum" ADD VALUE 'cancelacion'`);
        await queryRunner.query(`ALTER TABLE "return_request_photos" ADD CONSTRAINT "FK_c9865e3d402a7fe0e7f7309d2b2" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "return_requests" ADD CONSTRAINT "FK_c7f39dfc32be2b7be25c139ba04" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "return_requests" ADD CONSTRAINT "FK_9272512330251fdcc481a7f22e7" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "return_request_items" ADD CONSTRAINT "FK_9d17641dc7ee38212e92245ca1d" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "return_request_items" ADD CONSTRAINT "FK_7a5e16ec9147bef173435f1bf2c" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD CONSTRAINT "FK_a42db6369017df60549539f5567" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD CONSTRAINT "FK_7f48aa5d56c42aeb495db016683" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT "FK_7f48aa5d56c42aeb495db016683"`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT "FK_a42db6369017df60549539f5567"`);
        await queryRunner.query(`ALTER TABLE "return_request_items" DROP CONSTRAINT "FK_7a5e16ec9147bef173435f1bf2c"`);
        await queryRunner.query(`ALTER TABLE "return_request_items" DROP CONSTRAINT "FK_9d17641dc7ee38212e92245ca1d"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP CONSTRAINT "FK_9272512330251fdcc481a7f22e7"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP CONSTRAINT "FK_c7f39dfc32be2b7be25c139ba04"`);
        await queryRunner.query(`ALTER TABLE "return_request_photos" DROP CONSTRAINT "FK_c9865e3d402a7fe0e7f7309d2b2"`);
        // Los movimientos "cancelacion" no existen en el enum viejo: sin
        // borrarlos, la conversión de tipo de abajo falla con datos reales.
        await queryRunner.query(`DELETE FROM "stock_movements" WHERE "type" = 'cancelacion'`);
        await queryRunner.query(`CREATE TYPE "public"."stock_movements_type_enum_old" AS ENUM('reposicion', 'ajuste', 'merma', 'devolucion', 'venta')`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ALTER COLUMN "type" TYPE "public"."stock_movements_type_enum_old" USING "type"::"text"::"public"."stock_movements_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."stock_movements_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."stock_movements_type_enum_old" RENAME TO "stock_movements_type_enum"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "stock_committed"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "delivered_at"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "paid_at"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "UQ_75eba1c6b1a66b09f2a97e6927b"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "order_number"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_55dcf88525a9b0a64d8445f827"`);
        await queryRunner.query(`DROP TABLE "refunds"`);
        await queryRunner.query(`DROP TYPE "public"."refund_origin"`);
        await queryRunner.query(`DROP TYPE "public"."refund_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7a5e16ec9147bef173435f1bf2"`);
        await queryRunner.query(`DROP TABLE "return_request_items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c7f39dfc32be2b7be25c139ba0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b15a2c75b0a0d3585fe62dd217"`);
        await queryRunner.query(`DROP TABLE "return_requests"`);
        await queryRunner.query(`DROP TYPE "public"."return_request_type"`);
        await queryRunner.query(`DROP TYPE "public"."return_request_status"`);
        await queryRunner.query(`DROP TABLE "return_request_photos"`);
    }

}
