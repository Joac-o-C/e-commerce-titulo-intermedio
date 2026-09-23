import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/products.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { CartItem } from './entities/cart-item.entity.js';
import { Cart } from './entities/cart.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart, CartItem]),
    ProductsModule,
    // Mismo motivo que en ProductsModule/UsersModule: habilita JwtAuthGuard
    // sobre los endpoints protegidos de este controller.
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [CartController],
  providers: [CartService],
  // `orders` lo consume para revalidar, bloquear y asociar el carrito en el checkout (CU-03).
  exports: [CartService],
})
export class CartModule {}
