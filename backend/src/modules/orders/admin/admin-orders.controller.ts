import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { JwtAccessPayload } from '../../auth/strategies/jwt.strategy.js';
import { UserRole } from '../../users/entities/user.entity.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { AddOrderNoteDto } from './dto/add-note.dto.js';
import { AdminCancelOrderDto } from './dto/admin-cancel-order.dto.js';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto.js';
import { QueryAdminOrdersDto } from './dto/query-admin-orders.dto.js';
import { TrackingDto } from './dto/tracking.dto.js';

/** CU-19 Ver y gestionar pedidos (admin). */
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRADOR)
export class AdminOrdersController {
  constructor(private readonly adminOrders: AdminOrdersService) {}

  /** @usecase CU-19 Ver y gestionar pedidos (admin) (paso 2) */
  @Get()
  list(@Query() query: QueryAdminOrdersDto) {
    return this.adminOrders.list(query);
  }

  /** @usecase CU-19 Ver y gestionar pedidos (admin) (flujo 2a) */
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="pedidos.csv"')
  export(@Query() query: QueryAdminOrdersDto) {
    return this.adminOrders.exportCsv(query);
  }

  /** @usecase CU-19 Ver y gestionar pedidos (admin) (pasos 3-4) */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminOrders.getDetail(id);
  }

  /** @usecase CU-19 Ver y gestionar pedidos (admin) (pasos 5-10, flujos 7a/7b/8a) */
  @Post(':id/status')
  @HttpCode(200)
  async changeStatus(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeOrderStatusDto,
  ) {
    await this.adminOrders.changeStatus(user.sub, id, dto);
    // Paso 10: confirma y refresca el detalle.
    return this.adminOrders.getDetail(id);
  }

  /** @usecase CU-19 Ver y gestionar pedidos (admin) (paso 6, flujo 7b) */
  @Patch(':id/tracking')
  async updateTracking(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TrackingDto) {
    await this.adminOrders.updateTracking(id, dto);
    return this.adminOrders.getDetail(id);
  }

  /** @usecase CU-19 Ver y gestionar pedidos (admin) (flujo 5a) */
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCancelOrderDto,
  ) {
    const result = await this.adminOrders.cancel(user.sub, id, dto);
    return { ...result, order: await this.adminOrders.getDetail(id) };
  }

  /** @usecase CU-19 Ver y gestionar pedidos (admin) (flujo 5c) */
  @Post(':id/notes')
  @HttpCode(200)
  async addNote(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOrderNoteDto,
  ) {
    await this.adminOrders.addNote(user.sub, id, dto.text);
    return this.adminOrders.getDetail(id);
  }
}
