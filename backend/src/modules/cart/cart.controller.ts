import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtAccessPayload } from '../auth/strategies/jwt.strategy.js';
import { CartService } from './cart.service.js';
import { AddItemDto } from './dto/add-item.dto.js';
import { MergeCartDto } from './dto/merge-cart.dto.js';
import { ResolveGuestItemDto } from './dto/resolve-guest-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /** @usecase CU-11 Modificar o quitar ítem del carrito */
  @Get()
  @UseGuards(JwtAuthGuard)
  getCart(@CurrentUser() user: JwtAccessPayload) {
    return this.cartService.getCart(user.sub);
  }

  /** @usecase CU-02 Agregar producto al carrito */
  @Post('items')
  @UseGuards(JwtAuthGuard)
  addItem(@CurrentUser() user: JwtAccessPayload, @Body() dto: AddItemDto) {
    return this.cartService.addItem(user.sub, dto.variantId, dto.quantity);
  }

  /** @usecase CU-11 Modificar o quitar ítem del carrito */
  @Patch('items/:itemId')
  @UseGuards(JwtAuthGuard)
  updateItem(@CurrentUser() user: JwtAccessPayload, @Param('itemId') itemId: string, @Body() dto: UpdateItemDto) {
    return this.cartService.updateItemQuantity(user.sub, itemId, dto.quantity);
  }

  /** @usecase CU-11 Modificar o quitar ítem del carrito (flujo 3a) */
  @Delete('items/:itemId')
  @UseGuards(JwtAuthGuard)
  removeItem(@CurrentUser() user: JwtAccessPayload, @Param('itemId') itemId: string) {
    return this.cartService.removeItem(user.sub, itemId);
  }

  /** @usecase CU-11 Modificar o quitar ítem del carrito (flujo 3b) */
  @Delete()
  @UseGuards(JwtAuthGuard)
  clearCart(@CurrentUser() user: JwtAccessPayload) {
    return this.cartService.clearCart(user.sub);
  }

  /**
   * @usecase CU-06 Iniciar sesión (fusión del carrito de invitado, preview)
   */
  @Post('merge/preview')
  @UseGuards(JwtAuthGuard)
  previewMerge(@CurrentUser() user: JwtAccessPayload, @Body() dto: MergeCartDto) {
    return this.cartService.previewMerge(user.sub, dto.items);
  }

  /**
   * @usecase CU-06 Iniciar sesión (fusión del carrito de invitado, confirm)
   */
  @Post('merge/confirm')
  @UseGuards(JwtAuthGuard)
  confirmMerge(@CurrentUser() user: JwtAccessPayload, @Body() dto: MergeCartDto) {
    return this.cartService.confirmMerge(user.sub, dto.items);
  }

  /**
   * Sin guard: valida un ítem del carrito de invitado contra el catálogo en
   * servidor, sin persistir nada (Visitante no tiene sesión).
   * @usecase CU-02 Agregar producto al carrito
   */
  @Post('guest/resolve-item')
  resolveGuestItem(@Body() dto: ResolveGuestItemDto) {
    return this.cartService.resolveGuestItem(dto.variantId, dto.quantity, dto.alreadyInCart);
  }
}
