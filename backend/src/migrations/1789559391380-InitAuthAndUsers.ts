import { MigrationInterface, QueryRunner } from "typeorm";

export class InitAuthAndUsers1789559391380 implements MigrationInterface {
    name = 'InitAuthAndUsers1789559391380'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Requerida por PrimaryGeneratedColumn('uuid') en todas las entidades.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "alias" character varying NOT NULL, "street" character varying NOT NULL, "number" character varying NOT NULL, "floor_apt" character varying, "city" character varying NOT NULL, "province" character varying NOT NULL, "postal_code" character varying NOT NULL, "phone" character varying NOT NULL, "notes" character varying, "is_default" boolean NOT NULL DEFAULT false, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_745d8f43d3af10ab8247465e450" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('cliente', 'administrador')`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('pendiente_verificacion', 'activa', 'deshabilitada', 'suspendida')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "first_name" character varying NOT NULL, "last_name" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'cliente', "status" "public"."users_status_enum" NOT NULL DEFAULT 'pendiente_verificacion', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "email_verification_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c20ed35f3d31d486aabcd0564da" UNIQUE ("token_hash"), CONSTRAINT "PK_417a095bbed21c2369a6a01ab9a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "login_attempts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying, "ip_address" character varying NOT NULL, "success" boolean NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_070e613c8f768b1a70742705c5b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c31c455f4a8c274dbd46a498b4" ON "login_attempts"  ("ip_address", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_626c200d81876571d9f4894963" ON "login_attempts"  ("email", "created_at") `);
        await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_91185d86d5d7557b19abbb2868b" UNIQUE ("token_hash"), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_by_ip" character varying NOT NULL, "user_agent" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_45d36c31cba19beca594c5934d" ON "refresh_tokens"  ("user_id", "revoked_at") `);
        await queryRunner.query(`CREATE TYPE "public"."email_logs_template_enum" AS ENUM('verificacion', 'reset_password', 'password_changed', 'resultado_pago', 'confirmacion_pedido', 'cambio_estado_pedido', 'cancelacion', 'comprobante_posventa', 'resultado_reembolso')`);
        await queryRunner.query(`CREATE TYPE "public"."email_logs_status_enum" AS ENUM('enviado', 'fallido', 'reintentando', 'rebotado', 'omitido_por_rate_limit')`);
        await queryRunner.query(`CREATE TABLE "email_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying, "recipient_email" character varying NOT NULL, "template" "public"."email_logs_template_enum" NOT NULL, "payload_snapshot" jsonb, "status" "public"."email_logs_status_enum" NOT NULL, "related_order_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_999382218924e953a790d340571" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5a32892b4215725e65fed68b44" ON "email_logs"  ("user_id", "template", "created_at") `);
        await queryRunner.query(`ALTER TABLE "addresses" ADD CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "FK_fdcb77f72f529bf65c95d72a147" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"`);
        await queryRunner.query(`ALTER TABLE "email_verification_tokens" DROP CONSTRAINT "FK_fdcb77f72f529bf65c95d72a147"`);
        await queryRunner.query(`ALTER TABLE "addresses" DROP CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5a32892b4215725e65fed68b44"`);
        await queryRunner.query(`DROP TABLE "email_logs"`);
        await queryRunner.query(`DROP TYPE "public"."email_logs_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."email_logs_template_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_45d36c31cba19beca594c5934d"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_626c200d81876571d9f4894963"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c31c455f4a8c274dbd46a498b4"`);
        await queryRunner.query(`DROP TABLE "login_attempts"`);
        await queryRunner.query(`DROP TABLE "email_verification_tokens"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "addresses"`);
    }

}
