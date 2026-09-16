import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../../providers/storage/storage.module.js';
import { User } from '../users/entities/user.entity.js';
import { AdminCategoriesController } from './categories/admin-categories.controller.js';
import { CategoriesController } from './categories/categories.controller.js';
import { CategoriesService } from './categories/categories.service.js';
import { Category } from './entities/category.entity.js';
import { Product } from './entities/product.entity.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { AdminProductsController } from './admin-products.controller.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { AdminStockController } from './stock/admin-stock.controller.js';
import { StockService } from './stock/stock.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category, Product, ProductVariant, ProductImage, StockMovement, User]),
    StorageModule,
    // Mismo motivo que en UsersModule: habilita JwtAuthGuard sobre los
    // controllers admin de este módulo.
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [
    CategoriesController,
    AdminCategoriesController,
    ProductsController,
    AdminProductsController,
    AdminStockController,
  ],
  providers: [CategoriesService, ProductsService, StockService],
  // ProductsService se exporta para que `cart`/`orders` lo consuman en Fase 3+.
  exports: [ProductsService],
})
export class ProductsModule {}
