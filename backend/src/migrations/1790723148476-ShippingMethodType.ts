import { MigrationInterface, QueryRunner } from "typeorm";

export class ShippingMethodType1790723148476 implements MigrationInterface {
    name = 'ShippingMethodType1790723148476'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."shipping_method_type" AS ENUM('domicilio', 'retiro')`);
        await queryRunner.query(`ALTER TABLE "shipping_methods" ADD "type" "public"."shipping_method_type" NOT NULL DEFAULT 'domicilio'`);
        // Métodos ya cargados: los de retiro (local o sucursal) se reconocen por el nombre.
        await queryRunner.query(`UPDATE "shipping_methods" SET "type" = 'retiro' WHERE "name" ILIKE 'retiro%'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shipping_methods" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TYPE "public"."shipping_method_type"`);
    }

}
