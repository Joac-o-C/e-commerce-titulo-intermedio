import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity.js';
import { EmailLog } from './entities/email-log.entity.js';
import { MAIL_PROVIDER } from './mail-provider.interface.js';
import { NotificationsService } from './notifications.service.js';
import { ConsoleMailProvider } from './providers/console-mail.provider.js';
import { SmtpMailProvider } from './providers/smtp-mail.provider.js';

@Module({
  // User sólo para leer el nombre del destinatario y marcar rebotes (CU-20 5a).
  imports: [TypeOrmModule.forFeature([EmailLog, User])],
  providers: [
    NotificationsService,
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('MAIL_PROVIDER') === 'console' ? new ConsoleMailProvider() : new SmtpMailProvider(config),
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
