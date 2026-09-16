import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { LoginAttempt } from '../entities/login-attempt.entity.js';

export class AccountLockedException extends HttpException {
  constructor() {
    super('Cuenta bloqueada temporalmente por intentos fallidos', HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class IpLockedException extends HttpException {
  constructor() {
    super('Origen bloqueado temporalmente por intentos fallidos', HttpStatus.TOO_MANY_REQUESTS);
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
      throw new AccountLockedException();
    }

    const ipWindowStart = new Date(Date.now() - this.ipWindowMin * 60_000);
    const ipFailures = await this.repo.count({
      where: { ipAddress: ip, success: false, createdAt: MoreThanOrEqual(ipWindowStart) },
    });
    // CU-06 (flujo 5a): IP bloqueada, no evalúa credenciales.
    if (ipFailures >= this.ipMaxAttempts) {
      throw new IpLockedException();
    }
  }

  async recordAttempt(email: string, ip: string, success: boolean): Promise<void> {
    await this.repo.save(this.repo.create({ email, ipAddress: ip, success }));
  }
}
