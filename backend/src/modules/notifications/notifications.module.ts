import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailLog } from './entities/email-log.entity.js';
import { MAIL_PROVIDER } from './mail-provider.interface.js';
import { NotificationsService } from './notifications.service.js';
import { ConsoleMailProvider } from './providers/console-mail.provider.js';

@Module({
  imports: [TypeOrmModule.forFeature([EmailLog])],
  providers: [
    NotificationsService,
    { provide: MAIL_PROVIDER, useClass: ConsoleMailProvider },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
