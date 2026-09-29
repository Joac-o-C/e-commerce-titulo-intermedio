import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { RefundsService } from '../../payments/refunds/refunds.service.js';
import { UserRole } from '../../users/entities/user.entity.js';
import { AdminReturnsService } from './admin-returns.service.js';

/**
 * Contadores de la barra de admin (decisión de la Fase 6): lo que espera
 * una acción del Administrador en CU-19, CU-21 y CU-22.
 */
@Controller('admin/summary')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRADOR)
export class AdminSummaryController {
  constructor(
    private readonly adminReturns: AdminReturnsService,
    private readonly refunds: RefundsService,
  ) {}

  /**
   * @usecase CU-19 Ver y gestionar pedidos (admin) (alerta de CU-21 4a/5a)
   * @usecase CU-22 Resolver solicitud de cambio o devolución (bandeja, flujos 8a y 10a)
   */
  @Get()
  async summary() {
    const [refundsNeedingAttention, returns] = await Promise.all([this.refunds.countNeedingAttention(), this.adminReturns.counters()]);
    return {
      refundsNeedingAttention,
      returnsPending: returns.pending,
      returnsOverdue: returns.overdue,
      replacementsPending: returns.replacementsPending,
    };
  }
}
