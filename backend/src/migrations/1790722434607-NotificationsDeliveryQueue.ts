import { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationsDeliveryQueue1790722434607 implements MigrationInterface {
    name = 'NotificationsDeliveryQueue1790722434607'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "email_bounced_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "email_logs" ADD "attempts" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "email_logs" ADD "next_attempt_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "email_logs" ADD "pending_message" jsonb`);
        await queryRunner.query(`ALTER TABLE "email_logs" ADD "last_error" character varying`);
        await queryRunner.query(`ALTER TABLE "email_logs" ADD "sent_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TYPE "public"."email_logs_status_enum" ADD VALUE 'pendiente'`);
        await queryRunner.query(`CREATE INDEX "IDX_8358135d2a365316f3f46b1af6" ON "email_logs"  ("status", "next_attempt_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_8358135d2a365316f3f46b1af6"`);
        // Sin la cola, un correo aún no entregado ya no se va a enviar: queda como fallido
        // (si no, el cast al enum viejo falla con filas en 'pendiente').
        await queryRunner.query(`UPDATE "email_logs" SET "status" = 'fallido' WHERE "status" = 'pendiente'`);
        await queryRunner.query(`CREATE TYPE "public"."email_logs_status_enum_old" AS ENUM('enviado', 'fallido', 'reintentando', 'rebotado', 'omitido_por_rate_limit')`);
        await queryRunner.query(`ALTER TABLE "email_logs" ALTER COLUMN "status" TYPE "public"."email_logs_status_enum_old" USING "status"::"text"::"public"."email_logs_status_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."email_logs_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."email_logs_status_enum_old" RENAME TO "email_logs_status_enum"`);
        await queryRunner.query(`ALTER TABLE "email_logs" DROP COLUMN "sent_at"`);
        await queryRunner.query(`ALTER TABLE "email_logs" DROP COLUMN "last_error"`);
        await queryRunner.query(`ALTER TABLE "email_logs" DROP COLUMN "pending_message"`);
        await queryRunner.query(`ALTER TABLE "email_logs" DROP COLUMN "next_attempt_at"`);
        await queryRunner.query(`ALTER TABLE "email_logs" DROP COLUMN "attempts"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_bounced_at"`);
    }

}
