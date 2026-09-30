import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import bcrypt from 'bcrypt';
import { type EntityManager, IsNull } from 'typeorm';
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX } from '../modules/auth/dto/password-policy.js';
import { Category } from '../modules/products/entities/category.entity.js';
import { ProductImage } from '../modules/products/entities/product-image.entity.js';
import { ProductVariant } from '../modules/products/entities/product-variant.entity.js';
import { Product } from '../modules/products/entities/product.entity.js';
import { User, UserRole, UserStatus } from '../modules/users/entities/user.entity.js';
import { AppDataSource } from '../providers/database/data-source.js';
import { SEED_CATEGORIES, SEED_PRODUCTS, type SeedProduct } from './catalog.js';
import { productSvg } from './images.js';

/**
 * Carga los datos de demo: un Administrador (credenciales desde
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD), el árbol de categorías y los
 * productos con sus variantes, stock inicial e imagen. Los métodos de envío
 * ya los carga la migración AddOrdersAndPayments.
 *
 * Es idempotente: lo que ya existe (admin por email, categoría por nombre y
 * padre, producto por nombre) se deja como está, así que se puede correr
 * de nuevo sin duplicar ni pisar cambios hechos desde el panel.
 *
 * Uso: `npm run seed` (con las migraciones ya corridas).
 */
async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Faltan SEED_ADMIN_EMAIL y/o SEED_ADMIN_PASSWORD en el .env');
  }
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    throw new Error(`SEED_ADMIN_PASSWORD no cumple la política: ${PASSWORD_POLICY_MESSAGE}`);
  }

  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      await seedAdmin(manager, email, password);
      const categories = await seedCategories(manager);
      await seedProducts(manager, categories);
    });
  } finally {
    await AppDataSource.destroy();
  }
}

async function seedAdmin(manager: EntityManager, email: string, password: string): Promise<void> {
  const existing = await manager.findOne(User, { where: { email } });
  if (existing) {
    console.log(`Admin ${email}: ya existía, no se modifica`);
    return;
  }
  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);
  await manager.save(
    User,
    manager.create(User, {
      email,
      passwordHash: await bcrypt.hash(password, rounds),
      firstName: 'Admin',
      lastName: 'Tienda',
      role: UserRole.ADMINISTRADOR,
      status: UserStatus.ACTIVA,
    }),
  );
  console.log(`Admin ${email}: creado`);
}

/** Devuelve las subcategorías por nombre, que es como las referencia el catálogo. */
async function seedCategories(manager: EntityManager): Promise<Map<string, Category>> {
  const byName = new Map<string, Category>();
  let created = 0;

  for (const [order, seed] of SEED_CATEGORIES.entries()) {
    let parent = await manager.findOne(Category, { where: { name: seed.name, parentId: IsNull() } });
    if (!parent) {
      parent = await manager.save(Category, manager.create(Category, { name: seed.name, description: seed.description, order }));
      created++;
    }
    for (const [childOrder, child] of seed.children.entries()) {
      let sub = await manager.findOne(Category, { where: { name: child.name, parentId: parent.id } });
      if (!sub) {
        sub = await manager.save(
          Category,
          manager.create(Category, { name: child.name, description: child.description, parentId: parent.id, order: childOrder }),
        );
        created++;
      }
      byName.set(child.name, sub);
    }
  }

  console.log(`Categorías: ${created} creadas`);
  return byName;
}

async function seedProducts(manager: EntityManager, categories: Map<string, Category>): Promise<void> {
  const uploadsDir = join(process.cwd(), 'uploads', 'products');
  await mkdir(uploadsDir, { recursive: true });
  const baseUrl = process.env.PUBLIC_ASSETS_URL ?? 'http://localhost:3000';
  let created = 0;

  for (const seed of SEED_PRODUCTS) {
    if (await manager.exists(Product, { where: { name: seed.name } })) continue;
    const category = categories.get(seed.category);
    if (!category) throw new Error(`Categoría "${seed.category}" inexistente en el catálogo de demo`);

    const product = await manager.save(
      Product,
      manager.create(Product, {
        name: seed.name,
        description: seed.description,
        price: seed.price.toFixed(2),
        brand: seed.brand,
        isPublished: seed.isPublished ?? true,
        lowStockThreshold: seed.lowStockThreshold ?? null,
        categories: [category],
      }),
    );

    const fileName = `seed-${seed.sku.toLowerCase()}.svg`;
    await writeFile(join(uploadsDir, fileName), productSvg(seed.garment, seed.color, seed.name));
    await manager.save(
      ProductImage,
      manager.create(ProductImage, {
        productId: product.id,
        url: `${baseUrl}/uploads/products/${fileName}`,
        order: 0,
        altText: seed.name,
      }),
    );

    await manager.save(
      ProductVariant,
      variantsFor(seed).map((v) => manager.create(ProductVariant, { ...v, productId: product.id })),
    );
    created++;
  }

  console.log(`Productos: ${created} creados (${SEED_PRODUCTS.length - created} ya existían)`);
}

function variantsFor(seed: SeedProduct): Pick<ProductVariant, 'sku' | 'attributes' | 'stockTotal' | 'position'>[] {
  // Sin talles: variante implícita única, igual que el alta de CU-16.
  if (typeof seed.stock === 'number') {
    return [{ sku: seed.sku, attributes: {}, stockTotal: seed.stock, position: 0 }];
  }
  // El orden de carga del catálogo es el orden en que se ven los talles.
  return Object.entries(seed.stock).map(([talle, stockTotal], position) => ({
    sku: `${seed.sku}-${talle.replace(/\W/g, '')}`,
    attributes: { Talle: talle },
    stockTotal,
    position,
  }));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
