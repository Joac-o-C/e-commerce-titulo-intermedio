import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtAccessPayload } from '../auth/strategies/jwt.strategy.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutQuoteDto } from './dto/checkout-quote.dto.js';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto.js';
import { ShippingMethodsQueryDto } from './dto/shipping-methods-query.dto.js';

/**
 * CU-03 Realizar checkout. Sin checkout de invitado: todo el controller
 * exige sesión iniciada (precondición 1 de la ficha).
 */
@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  /** @usecase CU-03 Realizar checkout (pasos 2-3, flujos 2a/3a/3b) */
  @Post('revalidate')
  revalidate(@CurrentUser() user: JwtAccessPayload) {
    return this.checkoutService.revalidate(user.sub);
  }

  /** @usecase CU-03 Realizar checkout (pasos 6-7, flujos 6a/7a) */
  @Get('shipping-methods')
  shippingMethods(@CurrentUser() user: JwtAccessPayload, @Query() query: ShippingMethodsQueryDto) {
    return this.checkoutService.listShippingMethods(user.sub, query.addressId);
  }

  /** @usecase CU-03 Realizar checkout (pasos 9-10) */
  @Post('quote')
  quote(@CurrentUser() user: JwtAccessPayload, @Body() dto: CheckoutQuoteDto) {
    return this.checkoutService.quote(user.sub, dto.addressId, dto.shippingMethodId);
  }

  /** @usecase CU-03 Realizar checkout (pasos 12-18, flujos 13a/17a) */
  @Post()
  confirm(@CurrentUser() user: JwtAccessPayload, @Body() dto: ConfirmCheckoutDto) {
    return this.checkoutService.confirm(user.sub, dto);
  }
}
