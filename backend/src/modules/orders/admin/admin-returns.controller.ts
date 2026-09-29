import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { JwtAccessPayload } from '../../auth/strategies/jwt.strategy.js';
import { UserRole } from '../../users/entities/user.entity.js';
import { AdminReturnsService } from './admin-returns.service.js';
import {
  ApproveReturnDto,
  DispatchReplacementDto,
  QueryAdminReturnsDto,
  ReceiveReturnDto,
  RejectReturnDto,
} from './dto/resolve-return.dto.js';

/** CU-22 Resolver solicitud de cambio o devolución (admin). */
@Controller('admin/returns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRADOR)
export class AdminReturnsController {
  constructor(private readonly adminReturns: AdminReturnsService) {}

  /** @usecase CU-22 Resolver solicitud de cambio o devolución (bandeja, flujo 8a) */
  @Get()
  list(@Query() query: QueryAdminReturnsDto) {
    return this.adminReturns.list(query);
  }

  /** @usecase CU-22 Resolver solicitud de cambio o devolución (paso 2, flujo 2a) */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminReturns.getDetail(id);
  }

  /** @usecase CU-22 Resolver solicitud de cambio o devolución (pasos 3-7, flujo 4a) */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(@CurrentUser() user: JwtAccessPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveReturnDto) {
    await this.adminReturns.approve(user.sub, id, dto);
    return this.adminReturns.getDetail(id);
  }

  /** @usecase CU-22 Resolver solicitud de cambio o devolución (flujo 3a) */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(@CurrentUser() user: JwtAccessPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectReturnDto) {
    await this.adminReturns.reject(user.sub, id, dto);
    return this.adminReturns.getDetail(id);
  }

  /** @usecase CU-22 Resolver solicitud de cambio o devolución (pasos 8-12, flujos 9a/10a/10b) */
  @Post(':id/receive')
  @HttpCode(200)
  async receive(@CurrentUser() user: JwtAccessPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveReturnDto) {
    await this.adminReturns.receive(user.sub, id, dto);
    return this.adminReturns.getDetail(id);
  }

  /** @usecase CU-22 Resolver solicitud de cambio o devolución (flujo 10a: despacho de la reposición) */
  @Post(':id/replacement/dispatch')
  @HttpCode(200)
  async dispatchReplacement(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DispatchReplacementDto) {
    await this.adminReturns.dispatchReplacement(id, dto);
    return this.adminReturns.getDetail(id);
  }
}
