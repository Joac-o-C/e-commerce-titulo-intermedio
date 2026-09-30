import { MigrationInterface, QueryRunner } from "typeorm";

export class VariantPositionAndSoftDelete1790730428224 implements MigrationInterface {
    name = 'VariantPositionAndSoftDelete1790730428224'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_variants" ADD "position" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "product_variants" ADD "is_active" boolean NOT NULL DEFAULT true`);
        // Orden de carga para lo existente. Las variantes de un mismo alta
        // comparten created_at (un solo INSERT), así que el desempate es el
        // orden físico de inserción (ctid), que respeta el de la lista cargada.
        await queryRunner.query(`
            UPDATE "product_variants" pv SET "position" = ordered.pos
            FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY created_at, ctid) - 1 AS pos
                FROM "product_variants"
            ) ordered
            WHERE pv.id = ordered.id`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "position"`);
    }

}
