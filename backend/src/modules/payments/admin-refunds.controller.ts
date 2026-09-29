import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { JwtAccessPayload } from '../auth/strategies/jwt.strategy.js';
import { UserRole } from '../users/entities/user.entity.js';
import { ResolveRefundDto } from './dto/resolve-refund.dto.js';
import { RefundsService } from './refunds/refunds.service.js';

/**
 * Gestión de los reembolsos rechazados o pendientes de gestión (alerta de
 * CU-21 4a/5a), desde el detalle del pedido de CU-19.
 */
@Controller('admin/refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRADOR)
export class AdminRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  /** @usecase CU-19 Ver y gestionar pedidos (admin) → CU-21 Procesar reembolso */
  @Post(':id/retry')
  @HttpCode(204)
  retry(@CurrentUser() user: JwtAccessPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.refunds.retry(id, user.sub);
  }

  /** @usecase CU-19 Ver y gestionar pedidos (admin) */
  @Post(':id/resolve')
  @HttpCode(204)
  resolve(@CurrentUser() user: JwtAccessPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveRefundDto) {
    return this.refunds.resolveManually(id, user.sub, dto.note);
  }
}
