import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { JwtAccessPayload } from '../../auth/strategies/jwt.strategy.js';
import { UserRole } from '../../users/entities/user.entity.js';
import { StockService } from './stock.service.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { QueryStockDto } from './dto/query-stock.dto.js';
import { SetLowStockThresholdDto } from './dto/set-low-stock-threshold.dto.js';

@Controller('admin/stock')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRADOR)
export class AdminStockController {
  constructor(private readonly stockService: StockService) {}

  /** @usecase CU-18 Gestionar stock (paso 2: listado) */
  @Get()
  list(@Query() query: QueryStockDto) {
    return this.stockService.list(query);
  }

  /** @usecase CU-18 Gestionar stock */
  @Patch('variants/:variantId/adjust')
  adjust(
    @Param('variantId') variantId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.stockService.adjust(variantId, dto, user.sub);
  }

  /** @usecase CU-18 Gestionar stock (flujo 3b: ver historial) */
  @Get('variants/:variantId/history')
  history(@Param('variantId') variantId: string) {
    return this.stockService.history(variantId);
  }

  /** @usecase CU-18 Gestionar stock (flujo 3a: configurar umbral) */
  @Patch('products/:productId/threshold')
  setThreshold(@Param('productId') productId: string, @Body() dto: SetLowStockThresholdDto) {
    return this.stockService.setThreshold(productId, dto);
  }
}
