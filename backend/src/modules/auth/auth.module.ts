import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationToken } from './entities/email-verification-token.entity.js';
import { LoginAttempt } from './entities/login-attempt.entity.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { LoginThrottleService } from './login-throttle/login-throttle.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { TokenService } from './tokens/token.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken, EmailVerificationToken, PasswordResetToken, LoginAttempt]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN') as NonNullable<
            JwtModuleOptions['signOptions']
          >['expiresIn'],
        },
      }),
    }),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, LoginThrottleService, JwtStrategy],
})
export class AuthModule {}
