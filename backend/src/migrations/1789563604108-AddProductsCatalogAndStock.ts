import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductsCatalogAndStock1789563604108 implements MigrationInterface {
    name = 'AddProductsCatalogAndStock1789563604108'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "product_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "url" character varying NOT NULL, "order" integer NOT NULL DEFAULT '0', "alt_text" character varying, CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."stock_movements_type_enum" AS ENUM('reposicion', 'ajuste', 'merma', 'devolucion')`);
        await queryRunner.query(`CREATE TABLE "stock_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "variant_id" uuid NOT NULL, "type" "public"."stock_movements_type_enum" NOT NULL, "quantity" integer NOT NULL, "resulting_stock_total" integer NOT NULL, "reason" character varying, "actor_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_57a26b190618550d8e65fb860e7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "product_variants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "sku" character varying NOT NULL, "attributes" jsonb NOT NULL DEFAULT '{}', "stock_total" integer NOT NULL DEFAULT '0', "stock_reserved" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_46f236f21640f9da218a063a866" UNIQUE ("sku"), CONSTRAINT "PK_281e3f2c55652d6a22c0aa59fd7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text NOT NULL, "price" numeric(10,2) NOT NULL, "brand" character varying, "is_published" boolean NOT NULL DEFAULT false, "is_active" boolean NOT NULL DEFAULT true, "low_stock_threshold" integer, "version" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, "parent_id" uuid, "order" integer NOT NULL DEFAULT '0', "is_visible" boolean NOT NULL DEFAULT true, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "product_categories" ("product_id" uuid NOT NULL, "category_id" uuid NOT NULL, CONSTRAINT "PK_54f2e1dbf14cfa770f59f0aac8f" PRIMARY KEY ("product_id", "category_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8748b4a0e8de6d266f2bbc877f" ON "product_categories"  ("product_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_9148da8f26fc248e77a387e311" ON "product_categories"  ("category_id") `);
        await queryRunner.query(`ALTER TABLE "product_images" ADD CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_fffd5f1c504a8eb2917e93313ba" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_5be8e5807de2754a8a29904b2c7" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_variants" ADD CONSTRAINT "FK_6343513e20e2deab45edfce1316" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_88cea2dc9c31951d06437879b40" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_categories" ADD CONSTRAINT "FK_8748b4a0e8de6d266f2bbc877f6" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "product_categories" ADD CONSTRAINT "FK_9148da8f26fc248e77a387e3112" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_categories" DROP CONSTRAINT "FK_9148da8f26fc248e77a387e3112"`);
        await queryRunner.query(`ALTER TABLE "product_categories" DROP CONSTRAINT "FK_8748b4a0e8de6d266f2bbc877f6"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_88cea2dc9c31951d06437879b40"`);
        await queryRunner.query(`ALTER TABLE "product_variants" DROP CONSTRAINT "FK_6343513e20e2deab45edfce1316"`);
        await queryRunner.query(`ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_5be8e5807de2754a8a29904b2c7"`);
        await queryRunner.query(`ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_fffd5f1c504a8eb2917e93313ba"`);
        await queryRunner.query(`ALTER TABLE "product_images" DROP CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9148da8f26fc248e77a387e311"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8748b4a0e8de6d266f2bbc877f"`);
        await queryRunner.query(`DROP TABLE "product_categories"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TABLE "product_variants"`);
        await queryRunner.query(`DROP TABLE "stock_movements"`);
        await queryRunner.query(`DROP TYPE "public"."stock_movements_type_enum"`);
        await queryRunner.query(`DROP TABLE "product_images"`);
    }

}
