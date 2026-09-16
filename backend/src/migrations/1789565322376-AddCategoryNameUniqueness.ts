import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-17: "nombre único entre hermanos" (mismo `parent_id`) hoy sólo se
 * valida en `CategoriesService` — dos altas concurrentes con el mismo
 * nombre y padre pueden pasar ambas el chequeo en aplicación. Se agrega el
 * respaldo a nivel de base de datos con dos índices únicos parciales,
 * porque un UNIQUE simple sobre (parent_id, name) no detecta duplicados
 * entre categorías de primer nivel (parent_id NULL no choca consigo mismo
 * en Postgres).
 */
export class AddCategoryNameUniqueness1789565322376 implements MigrationInterface {
  name = 'AddCategoryNameUniqueness1789565322376';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UX_categories_name_top_level" ON "categories" ("name") WHERE "parent_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UX_categories_name_per_parent" ON "categories" ("parent_id", "name") WHERE "parent_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UX_categories_name_per_parent"`);
    await queryRunner.query(`DROP INDEX "public"."UX_categories_name_top_level"`);
  }
}
