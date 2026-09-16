import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, AuthTokens } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { JwtAccessPayload } from './strategies/jwt.strategy.js';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** @usecase CU-01 Registrar usuario */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    await this.authService.register(dto);
    return { message: 'Revisá tu casilla de correo para activar la cuenta' };
  }

  /** @usecase CU-06 Iniciar sesión */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto.email, dto.password, ip, req.headers['user-agent']);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  /** @usecase CU-06 Iniciar sesión (renovación de sesión) */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = req.cookies?.[REFRESH_COOKIE];
    const tokens = await this.authService.refresh(presented, ip, req.headers['user-agent']);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  /** @usecase CU-10 Cerrar sesión */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE);
    return { message: 'Sesión cerrada' };
  }

  /** @usecase CU-10 Cerrar sesión (flujo 1a) */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: JwtAccessPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.sub);
    res.clearCookie(REFRESH_COOKIE);
    return { message: 'Sesión cerrada en todos los dispositivos' };
  }

  /** @usecase CU-07 Verificar correo */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Query() query: VerifyEmailDto) {
    await this.authService.verifyEmail(query.token);
    return { message: 'Cuenta verificada, ya podés iniciar sesión' };
  }

  /**
   * CU-07 (sub-flujo Reenviar): el mensaje difiere según el resultado
   * interno — R3a informa esperar, el resto usa el mensaje genérico que
   * nunca revela si la cuenta existe o su estado.
   * @usecase CU-07 Verificar correo
   */
  @Post('verify-email/resend')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    const outcome = await this.authService.resendVerification(dto.email);
    if (outcome === 'rate_limited') {
      return { message: 'Ya enviamos varios correos recientemente, esperá antes de reintentar' };
    }
    return { message: 'Si el email corresponde a una cuenta pendiente, se envió un nuevo enlace' };
  }

  /**
   * CU-08 (sub-flujo Solicitar): siempre el mismo mensaje genérico, sin
   * distinguir ningún caso (ni siquiera el rate-limit).
   * @usecase CU-08 Recuperar contraseña
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'Si el email está registrado, te enviamos un enlace para restablecer la contraseña' };
  }

  /** @usecase CU-08 Recuperar contraseña */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: 'Contraseña actualizada, ya podés iniciar sesión' };
  }

  private setRefreshCookie(res: Response, tokens: AuthTokens): void {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: tokens.refreshTokenExpiresAt,
    });
  }
}
