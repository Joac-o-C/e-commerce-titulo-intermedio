import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCartItemVariantUniqueness1789580911906 implements MigrationInterface {
    name = 'AddCartItemVariantUniqueness1789580911906'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "UQ_cart_items_cart_variant" UNIQUE ("cart_id", "variant_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "UQ_cart_items_cart_variant"`);
    }

}
