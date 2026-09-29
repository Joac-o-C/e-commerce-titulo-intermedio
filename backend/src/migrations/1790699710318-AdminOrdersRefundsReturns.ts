import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Fase 6 (CU-19, CU-21, CU-22 + ABM de métodos de envío). Generada y
 * retocada a mano:
 * - `orders.internal_notes` (texto libre de la Fase 4) pasa a la tabla
 *   `order_notes`: se copian las notas existentes antes de borrar la columna,
 *   y `down()` las vuelve a juntar.
 * - Se quita la UNIQUE de `return_request_items.order_item_id` (revisión de
 *   la Fase 5: un ítem admite varias solicitudes por las unidades elegibles).
 *   `down()` no puede restaurarla si ya hay ítems con más de una solicitud y
 *   falla con un mensaje claro en vez de borrar solicitudes de clientes.
 * - Índice único de nombre de método de envío sin distinguir mayúsculas
 *   (sobre `lower(name)`, fuera de lo que genera TypeORM).
 * - `down()` borra las filas que usan valores de enum nuevos antes de
 *   restaurar cada enum (mismo patrón que `AddCustomerOrdersAndReturns`).
 */
export class AdminOrdersRefundsReturns1790699710318 implements MigrationInterface {
    name = 'AdminOrdersRefundsReturns1790699710318'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_7a5e16ec9147bef173435f1bf2"`);
        await queryRunner.query(`CREATE TABLE "order_notes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "author_id" uuid, "text" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_98b207341585da2a0faa9b841ed" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6b91346b6a8a16418d00d95654" ON "order_notes"  ("order_id", "created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."replacement_status" AS ENUM('pendiente_despacho', 'despachado')`);
        await queryRunner.query(`CREATE TABLE "return_replacements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "return_request_id" uuid NOT NULL, "order_item_id" uuid NOT NULL, "variant_id" uuid NOT NULL, "product_name_snapshot" character varying NOT NULL, "variant_attributes_snapshot" jsonb NOT NULL DEFAULT '{}', "quantity" integer NOT NULL, "status" "public"."replacement_status" NOT NULL, "tracking_carrier" character varying, "tracking_number" character varying, "dispatched_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6ac3fbaaef016e7e5ae8fc07998" PRIMARY KEY ("id"))`);
        await queryRunner.query(`INSERT INTO "order_notes" ("order_id", "author_id", "text", "created_at") SELECT "id", NULL, "internal_notes", "updated_at" FROM "orders" WHERE "internal_notes" IS NOT NULL AND btrim("internal_notes") <> ''`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "internal_notes"`);
        await queryRunner.query(`ALTER TABLE "return_request_items" ADD "quantity_received" integer`);
        await queryRunner.query(`CREATE TYPE "public"."return_item_condition" AS ENUM('ok', 'danado')`);
        await queryRunner.query(`ALTER TABLE "return_request_items" ADD "condition" "public"."return_item_condition"`);
        await queryRunner.query(`ALTER TABLE "return_request_items" ADD "refund_approved" boolean`);
        await queryRunner.query(`ALTER TABLE "return_requests" ADD "approved_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "return_requests" ADD "received_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "return_requests" ADD "internal_note" text`);
        await queryRunner.query(`ALTER TABLE "return_requests" ADD "refund_id" uuid`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD "attempt" integer NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD "last_error" character varying`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD "resolution_note" text`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD "resolved_by_user_id" uuid`);
        await queryRunner.query(`ALTER TYPE "public"."stock_movements_type_enum" ADD VALUE 'cambio'`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5a32892b4215725e65fed68b44"`);
        await queryRunner.query(`ALTER TYPE "public"."email_logs_template_enum" ADD VALUE 'resultado_posventa'`);
        await queryRunner.query(`ALTER TYPE "public"."payment_audit_logs_event_type_enum" ADD VALUE 'reembolso_solicitado'`);
        await queryRunner.query(`ALTER TYPE "public"."payment_audit_logs_event_type_enum" ADD VALUE 'reembolso_acreditado'`);
        await queryRunner.query(`ALTER TYPE "public"."payment_audit_logs_event_type_enum" ADD VALUE 'reembolso_rechazado'`);
        await queryRunner.query(`ALTER TYPE "public"."payment_audit_logs_event_type_enum" ADD VALUE 'reembolso_pasarela_no_disponible'`);
        await queryRunner.query(`ALTER TYPE "public"."payment_audit_logs_event_type_enum" ADD VALUE 'reembolso_gestion_manual'`);
        await queryRunner.query(`ALTER TYPE "public"."refund_origin" ADD VALUE 'CU-05'`);
        await queryRunner.query(`CREATE INDEX "IDX_5a32892b4215725e65fed68b44" ON "email_logs"  ("user_id", "template", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_7a5e16ec9147bef173435f1bf2" ON "return_request_items"  ("order_item_id") `);
        await queryRunner.query(`ALTER TABLE "order_notes" ADD CONSTRAINT "FK_2c241096df74dd0d8e1fc16ed63" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_notes" ADD CONSTRAINT "FK_fb5b1f4a67fc81ad6ed98da6a03" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "return_replacements" ADD CONSTRAINT "FK_0fd2dc5d8fdaa66bd0cb08deb31" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "return_replacements" ADD CONSTRAINT "FK_c1c10a1519d59a525f177b568fd" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "return_replacements" ADD CONSTRAINT "FK_0f2facf63f0e172ee238a4be723" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD CONSTRAINT "FK_c47d74ae205fda8aca393cd98d1" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UX_shipping_methods_name_lower" ON "shipping_methods" (lower("name"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const [{ count }] = await queryRunner.query(`SELECT count(*)::int AS "count" FROM (SELECT "order_item_id" FROM "return_request_items" GROUP BY "order_item_id" HAVING count(*) > 1) AS "d"`);
        if (count > 0) {
            throw new Error(`No se puede revertir: ${count} ítem(s) de pedido tienen más de una solicitud de posventa y la UNIQUE anterior no se puede restaurar`);
        }
        await queryRunner.query(`DROP INDEX "public"."UX_shipping_methods_name_lower"`);
        // Filas con valores de enum que no existían antes de esta migración.
        await queryRunner.query(`UPDATE "return_requests" SET "refund_id" = NULL WHERE "refund_id" IN (SELECT "id" FROM "refunds" WHERE "origin_cu" = 'CU-05')`);
        await queryRunner.query(`DELETE FROM "refunds" WHERE "origin_cu" = 'CU-05'`);
        await queryRunner.query(`DELETE FROM "payment_audit_logs" WHERE "event_type" IN ('reembolso_solicitado', 'reembolso_acreditado', 'reembolso_rechazado', 'reembolso_pasarela_no_disponible', 'reembolso_gestion_manual')`);
        await queryRunner.query(`DELETE FROM "email_logs" WHERE "template" = 'resultado_posventa'`);
        await queryRunner.query(`DELETE FROM "stock_movements" WHERE "type" = 'cambio'`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT "FK_c47d74ae205fda8aca393cd98d1"`);
        await queryRunner.query(`ALTER TABLE "return_replacements" DROP CONSTRAINT "FK_0f2facf63f0e172ee238a4be723"`);
        await queryRunner.query(`ALTER TABLE "return_replacements" DROP CONSTRAINT "FK_c1c10a1519d59a525f177b568fd"`);
        await queryRunner.query(`ALTER TABLE "return_replacements" DROP CONSTRAINT "FK_0fd2dc5d8fdaa66bd0cb08deb31"`);
        await queryRunner.query(`ALTER TABLE "order_notes" DROP CONSTRAINT "FK_fb5b1f4a67fc81ad6ed98da6a03"`);
        await queryRunner.query(`ALTER TABLE "order_notes" DROP CONSTRAINT "FK_2c241096df74dd0d8e1fc16ed63"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7a5e16ec9147bef173435f1bf2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5a32892b4215725e65fed68b44"`);
        await queryRunner.query(`CREATE TYPE "public"."refund_origin_old" AS ENUM('CU-14', 'CU-19', 'CU-22')`);
        await queryRunner.query(`ALTER TABLE "refunds" ALTER COLUMN "origin_cu" TYPE "public"."refund_origin_old" USING "origin_cu"::"text"::"public"."refund_origin_old"`);
        await queryRunner.query(`DROP TYPE "public"."refund_origin"`);
        await queryRunner.query(`ALTER TYPE "public"."refund_origin_old" RENAME TO "refund_origin"`);
        await queryRunner.query(`CREATE TYPE "public"."payment_audit_logs_event_type_enum_old" AS ENUM('notificacion_invalida', 'pedido_inexistente', 'pasarela_no_disponible', 'notificacion_duplicada', 'discrepancia', 'pago_procesado')`);
        await queryRunner.query(`ALTER TABLE "payment_audit_logs" ALTER COLUMN "event_type" TYPE "public"."payment_audit_logs_event_type_enum_old" USING "event_type"::"text"::"public"."payment_audit_logs_event_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."payment_audit_logs_event_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."payment_audit_logs_event_type_enum_old" RENAME TO "payment_audit_logs_event_type_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."email_logs_template_enum_old" AS ENUM('verificacion', 'reset_password', 'password_changed', 'resultado_pago', 'confirmacion_pedido', 'cambio_estado_pedido', 'cancelacion', 'comprobante_posventa', 'resultado_reembolso')`);
        await queryRunner.query(`ALTER TABLE "email_logs" ALTER COLUMN "template" TYPE "public"."email_logs_template_enum_old" USING "template"::"text"::"public"."email_logs_template_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."email_logs_template_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."email_logs_template_enum_old" RENAME TO "email_logs_template_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_5a32892b4215725e65fed68b44" ON "email_logs" USING btree ("user_id", "template", "created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."stock_movements_type_enum_old" AS ENUM('reposicion', 'ajuste', 'merma', 'devolucion', 'venta', 'cancelacion')`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ALTER COLUMN "type" TYPE "public"."stock_movements_type_enum_old" USING "type"::"text"::"public"."stock_movements_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."stock_movements_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."stock_movements_type_enum_old" RENAME TO "stock_movements_type_enum"`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP COLUMN "resolved_by_user_id"`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP COLUMN "resolution_note"`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP COLUMN "last_error"`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP COLUMN "attempt"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP COLUMN "refund_id"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP COLUMN "internal_note"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP COLUMN "received_at"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP COLUMN "approved_at"`);
        await queryRunner.query(`ALTER TABLE "return_request_items" DROP COLUMN "refund_approved"`);
        await queryRunner.query(`ALTER TABLE "return_request_items" DROP COLUMN "condition"`);
        await queryRunner.query(`DROP TYPE "public"."return_item_condition"`);
        await queryRunner.query(`ALTER TABLE "return_request_items" DROP COLUMN "quantity_received"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "internal_notes" text`);
        await queryRunner.query(`UPDATE "orders" SET "internal_notes" = "n"."text" FROM (SELECT "order_id", string_agg("text", E'\\n' ORDER BY "created_at") AS "text" FROM "order_notes" GROUP BY "order_id") AS "n" WHERE "n"."order_id" = "orders"."id"`);
        await queryRunner.query(`DROP TABLE "return_replacements"`);
        await queryRunner.query(`DROP TYPE "public"."replacement_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6b91346b6a8a16418d00d95654"`);
        await queryRunner.query(`DROP TABLE "order_notes"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7a5e16ec9147bef173435f1bf2" ON "return_request_items" USING btree ("order_item_id") `);
    }

}
