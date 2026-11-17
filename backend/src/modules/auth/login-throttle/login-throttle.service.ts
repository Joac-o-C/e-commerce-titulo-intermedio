import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { LoginAttempt } from '../entities/login-attempt.entity.js';

const lockMessage = (minutes: number) =>
  `Por seguridad, bloqueamos el inicio de sesión por varios intentos fallidos. Probá de nuevo en ${minutes} ${
    minutes === 1 ? 'minuto' : 'minutos'
  }.`;

/**
 * CU-06 (flujo 5a): el cuerpo lleva `retryAfterMinutes` para que el front
 * pueda decir cuánto falta sin adivinar la configuración del bloqueo.
 */
export class AccountLockedException extends HttpException {
  constructor(retryAfterMinutes: number) {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'ACCOUNT_LOCKED', message: lockMessage(retryAfterMinutes), retryAfterMinutes },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class IpLockedException extends HttpException {
  constructor(retryAfterMinutes: number) {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'IP_LOCKED', message: lockMessage(retryAfterMinutes), retryAfterMinutes },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Bloqueo de cuenta e IP por intentos fallidos de login (CU-06, flujo 5a).
 * Se consulta ANTES de comparar credenciales, para no filtrar información
 * ni gastar trabajo de hashing sobre una cuenta ya bloqueada.
 */
@Injectable()
export class LoginThrottleService {
  private readonly accountMaxAttempts: number;
  private readonly accountWindowMin: number;
  private readonly ipMaxAttempts: number;
  private readonly ipWindowMin: number;

  constructor(
    @InjectRepository(LoginAttempt)
    private readonly repo: Repository<LoginAttempt>,
    configService: ConfigService,
  ) {
    this.accountMaxAttempts = configService.get<number>('LOGIN_ACCOUNT_MAX_ATTEMPTS')!;
    this.accountWindowMin = configService.get<number>('LOGIN_ACCOUNT_LOCKOUT_WINDOW_MIN')!;
    this.ipMaxAttempts = configService.get<number>('LOGIN_IP_MAX_ATTEMPTS')!;
    this.ipWindowMin = configService.get<number>('LOGIN_IP_LOCKOUT_WINDOW_MIN')!;
  }

  /**
   * Lanza si la cuenta o la IP están bloqueadas por exceso de intentos
   * fallidos en su ventana configurada.
   * @usecase CU-06 Iniciar sesión
   */
  async assertNotLocked(email: string, ip: string): Promise<void> {
    const accountWindowStart = new Date(Date.now() - this.accountWindowMin * 60_000);
    const accountFailures = await this.repo.count({
      where: { email, success: false, createdAt: MoreThanOrEqual(accountWindowStart) },
    });
    // CU-06 (flujo 5a): cuenta bloqueada, no evalúa credenciales.
    if (accountFailures >= this.accountMaxAttempts) {
      throw new AccountLockedException(
        await this.minutesUntilUnlock({ email }, this.accountMaxAttempts, this.accountWindowMin),
      );
    }

    const ipWindowStart = new Date(Date.now() - this.ipWindowMin * 60_000);
    const ipFailures = await this.repo.count({
      where: { ipAddress: ip, success: false, createdAt: MoreThanOrEqual(ipWindowStart) },
    });
    // CU-06 (flujo 5a): IP bloqueada, no evalúa credenciales.
    if (ipFailures >= this.ipMaxAttempts) {
      throw new IpLockedException(
        await this.minutesUntilUnlock({ ipAddress: ip }, this.ipMaxAttempts, this.ipWindowMin),
      );
    }
  }

  /**
   * La ventana es deslizante: se desbloquea cuando sale de la ventana el
   * fallo que hace que haya `maxAttempts` (el `maxAttempts`-ésimo más
   * reciente). Mientras está bloqueado no se registran intentos nuevos.
   */
  private async minutesUntilUnlock(
    where: { email: string } | { ipAddress: string },
    maxAttempts: number,
    windowMin: number,
  ): Promise<number> {
    const [failure] = await this.repo.find({
      where: { ...where, success: false },
      order: { createdAt: 'DESC' },
      skip: maxAttempts - 1,
      take: 1,
    });
    if (!failure) return windowMin;
    const unlockAt = failure.createdAt.getTime() + windowMin * 60_000;
    return Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
  }

  async recordAttempt(email: string, ip: string, success: boolean): Promise<void> {
    await this.repo.save(this.repo.create({ email, ipAddress: ip, success }));
  }
}
