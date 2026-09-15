import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

/**
 * Smoke test de infraestructura: confirma que la app levantó y que puede
 * hablar con la base de datos. No corresponde a ningún CU de negocio; es
 * el entregable de la Fase 0 del plan de ejecución.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => this.db.pingCheck('database').withTimeout(1500),
    ]);
  }
}
