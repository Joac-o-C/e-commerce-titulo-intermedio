import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { EmailTemplate } from '../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { User, UserStatus } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { EmailVerificationToken } from './entities/email-verification-token.entity.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { LoginThrottleService } from './login-throttle/login-throttle.service.js';
import { TokenService } from './tokens/token.service.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export type ResendOutcome = 'sent' | 'no_eligible_account' | 'rate_limited';
export type ForgotPasswordOutcome = 'sent' | 'no_eligible_account' | 'rate_limited';

/**
 * Controla la emisión y validación de todo tipo de token (sesión,
 * verificación de correo, reset de contraseña) — users.module es dueño de
 * la entidad User/Address, este service nunca accede a su repositorio
 * directamente, solo a través de UsersService.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(EmailVerificationToken)
    private readonly verificationTokenRepo: Repository<EmailVerificationToken>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepo: Repository<PasswordResetToken>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly tokenService: TokenService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * @usecase CU-01 Registrar usuario
   * @usecase-includes CU-20
   */
  async register(params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<void> {
    // CU-01 (flujo 6a): email ya registrado — mensaje genérico, no revela nada más.
    const existing = await this.usersService.findByEmail(params.email);
    if (existing) {
      throw new ConflictException('El correo ya está en uso');
    }

    const user = await this.usersService.create(params);
    await this.sendVerificationEmail(user);
  }

  /**
   * @usecase CU-06 Iniciar sesión
   */
  async login(email: string, password: string, ip: string, userAgent?: string): Promise<AuthTokens> {
    await this.loginThrottle.assertNotLocked(email, ip);

    const user = await this.usersService.findByEmail(email);
    // CU-06 (flujo 6a): email inexistente o password incorrecto -> mensaje genérico.
    const passwordOk = user ? await this.usersService.verifyPassword(user, password) : false;
    if (!user || !passwordOk) {
      await this.loginThrottle.recordAttempt(email, ip, false);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // CU-06 (flujo 7a): cuenta pendiente de verificación, no inicia sesión.
    if (user.status === UserStatus.PENDIENTE_VERIFICACION) {
      throw new UnauthorizedException('Debés verificar tu correo antes de iniciar sesión');
    }
    // CU-06 (flujo 7b): cuenta deshabilitada o suspendida, no inicia sesión.
    if (user.status !== UserStatus.ACTIVA) {
      throw new UnauthorizedException('La cuenta no está disponible');
    }

    await this.loginThrottle.recordAttempt(email, ip, true);
    return this.issueTokenPair(user, ip, userAgent);
  }

  /**
   * Rota el refresh token: revoca el presentado y emite un par nuevo.
   * @usecase CU-06 Iniciar sesión (renovación de sesión)
   */
  async refresh(presentedToken: string | undefined, ip: string, userAgent?: string): Promise<AuthTokens> {
    // CU-06 (flujo 12a): sin cookie de refresh no hay nada que rotar.
    if (!presentedToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const hash = this.tokenService.hashToken(presentedToken);
    const match = await this.refreshTokenRepo.findOne({ where: { tokenHash: hash } });

    // CU-06 (flujo 12a): token inexistente, revocado o expirado -> rechaza.
    if (!match || match.revokedAt || match.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    match.revokedAt = new Date();
    await this.refreshTokenRepo.save(match);

    const user = await this.usersService.findById(match.userId);
    if (!user) throw new UnauthorizedException('Refresh token inválido');

    return this.issueTokenPair(user, ip, userAgent);
  }

  /**
   * CU-10 (flujo 2a): tolera token ausente/ya revocado, no es un error.
   * @usecase CU-10 Cerrar sesión
   */
  async logout(presentedToken?: string): Promise<void> {
    if (!presentedToken) return;
    const hash = this.tokenService.hashToken(presentedToken);
    const match = await this.refreshTokenRepo.findOne({ where: { tokenHash: hash } });
    if (match && !match.revokedAt) {
      match.revokedAt = new Date();
      await this.refreshTokenRepo.save(match);
    }
  }

  /**
   * CU-10 (flujo 1a): cierra sesión en todos los dispositivos.
   * @usecase CU-10 Cerrar sesión
   */
  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllRefreshTokensForUser(userId);
  }

  /**
   * @usecase CU-07 Verificar correo
   */
  async verifyEmail(presentedToken: string): Promise<void> {
    const hash = this.tokenService.hashToken(presentedToken);
    const match = await this.verificationTokenRepo.findOne({ where: { tokenHash: hash } });

    // CU-07 (flujo 3a/3b): token inexistente, expirado o ya consumido.
    if (!match || match.consumedAt || match.expiresAt < new Date()) {
      throw new UnauthorizedException('El enlace de verificación no es válido');
    }

    const user = await this.usersService.findById(match.userId);
    if (!user) throw new UnauthorizedException('El enlace de verificación no es válido');

    // CU-07 (flujo 4a): cuenta ya activa.
    if (user.status === UserStatus.ACTIVA) return;
    // CU-07 (flujo 4b): cuenta deshabilitada/suspendida, no puede verificarse.
    if (user.status !== UserStatus.PENDIENTE_VERIFICACION) {
      throw new UnauthorizedException('La cuenta no puede verificarse');
    }

    match.consumedAt = new Date();
    await this.verificationTokenRepo.save(match);
    await this.usersService.markVerified(user.id);
  }

  /**
   * Sub-flujo Reenviar de CU-07. El resultado interno es tipado; el
   * controller decide el mensaje exacto según la ficha (R2a no revela
   * nada, R3a sí informa "esperar").
   * @usecase CU-07 Verificar correo
   * @usecase-includes CU-20
   */
  async resendVerification(email: string): Promise<ResendOutcome> {
    const user = await this.usersService.findByEmail(email);
    // CU-07 (flujo R2a): no hay cuenta pendiente con ese email.
    if (!user || user.status !== UserStatus.PENDIENTE_VERIFICACION) {
      return 'no_eligible_account';
    }

    const { status } = await this.sendVerificationEmail(user);
    // CU-07 (flujo R3a): ya alcanzó el máximo de reenvíos en la última hora.
    if (status === 'omitido_por_rate_limit') return 'rate_limited';
    return 'sent';
  }

  /**
   * Sub-flujo Solicitar de CU-08. A diferencia de CU-07, ni el rate-limit
   * se revela: siempre el mismo mensaje genérico (lo decide el controller).
   * @usecase CU-08 Recuperar contraseña
   * @usecase-includes CU-20
   */
  async forgotPassword(email: string): Promise<ForgotPasswordOutcome> {
    const user = await this.usersService.findByEmail(email);
    // CU-08 (flujo S3a): no existe cuenta con ese email.
    if (!user) return 'no_eligible_account';

    await this.invalidatePendingTokens(this.resetTokenRepo, user.id);
    const ttlHours = this.configService.get<number>('PASSWORD_RESET_TOKEN_TTL_HOURS')!;
    const { plain, hash } = this.tokenService.generateOpaqueToken();
    await this.resetTokenRepo.save(
      this.resetTokenRepo.create({
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      }),
    );

    const { status } = await this.notificationsService.send({
      userId: user.id,
      recipientEmail: user.email,
      template: EmailTemplate.RESET_PASSWORD,
      data: { token: plain },
    });
    // CU-08 (flujo S2a): mismo mensaje genérico aunque esté rate-limited.
    if (status === 'omitido_por_rate_limit') return 'rate_limited';
    return 'sent';
  }

  /**
   * @usecase CU-08 Recuperar contraseña
   * @usecase-includes CU-20
   */
  async resetPassword(presentedToken: string, newPassword: string): Promise<void> {
    const hash = this.tokenService.hashToken(presentedToken);
    const match = await this.resetTokenRepo.findOne({ where: { tokenHash: hash } });

    // CU-08 (flujo 3a): token inexistente, expirado o ya consumido.
    if (!match || match.consumedAt || match.expiresAt < new Date()) {
      throw new UnauthorizedException('El enlace de restablecimiento no es válido');
    }

    const user = await this.usersService.findById(match.userId);
    if (!user) throw new UnauthorizedException('El enlace de restablecimiento no es válido');

    // CU-08 (flujo 6b): la nueva contraseña no puede ser igual a la vigente.
    const samePassword = await this.usersService.verifyPassword(user, newPassword);
    if (samePassword) {
      throw new ConflictException('La nueva contraseña debe ser distinta de la actual');
    }

    match.consumedAt = new Date();
    await this.resetTokenRepo.save(match);
    await this.usersService.updatePassword(user.id, newPassword);

    // CU-08 (paso 8): revoca todas las sesiones activas de la cuenta.
    await this.revokeAllRefreshTokensForUser(user.id);

    // CU-08 (paso 9): si estaba pendiente de verificación, pasa a activa.
    if (user.status === UserStatus.PENDIENTE_VERIFICACION) {
      await this.usersService.activateViaPasswordReset(user.id);
    }

    // CU-08 (flujo 10a): si falla el aviso, el cambio queda igual aplicado.
    await this.notificationsService.send({
      userId: user.id,
      recipientEmail: user.email,
      template: EmailTemplate.PASSWORD_CHANGED,
      data: { changedAt: new Date().toISOString() },
    });
  }

  private async sendVerificationEmail(
    user: User,
  ): Promise<{ status: string }> {
    await this.invalidatePendingTokens(this.verificationTokenRepo, user.id);
    const ttlHours = this.configService.get<number>('EMAIL_VERIFICATION_TOKEN_TTL_HOURS')!;
    const { plain, hash } = this.tokenService.generateOpaqueToken();
    await this.verificationTokenRepo.save(
      this.verificationTokenRepo.create({
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      }),
    );

    return this.notificationsService.send({
      userId: user.id,
      recipientEmail: user.email,
      template: EmailTemplate.VERIFICACION,
      data: { token: plain },
    });
  }

  private async invalidatePendingTokens(
    repo: Repository<EmailVerificationToken> | Repository<PasswordResetToken>,
    userId: string,
  ): Promise<void> {
    await repo.update(
      { userId, consumedAt: IsNull() } as never,
      { consumedAt: new Date() } as never,
    );
  }

  private async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await this.refreshTokenRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async issueTokenPair(user: User, ip: string, userAgent?: string): Promise<AuthTokens> {
    // Secret y expiresIn ya quedaron fijados por JwtModule.registerAsync
    // (auth.module.ts); no hace falta repetirlos en cada sign().
    const accessToken = this.jwtService.sign({ sub: user.id, role: user.role });

    const { plain, hash } = this.tokenService.generateOpaqueToken();
    const refreshTtl = this.parseDurationToMs(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')!,
    );
    const refreshTokenExpiresAt = new Date(Date.now() + refreshTtl);

    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId: user.id,
        tokenHash: hash,
        expiresAt: refreshTokenExpiresAt,
        createdByIp: ip,
        userAgent: userAgent ?? null,
      }),
    );

    return { accessToken, refreshToken: plain, refreshTokenExpiresAt };
  }

  /** Soporta sufijos simples: 15m, 7d, 1h, 30s. Suficiente para este TP. */
  private parseDurationToMs(duration: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(duration);
    if (!match) {
      throw new Error(`JWT_REFRESH_EXPIRES_IN con formato inválido: ${duration}`);
    }
    const value = Number(match[1]);
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
    return value * unitMs;
  }
}
