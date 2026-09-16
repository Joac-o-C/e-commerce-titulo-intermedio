import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmailLog, EmailStatus, EmailTemplate } from './entities/email-log.entity.js';
import { MAIL_PROVIDER } from './mail-provider.interface.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: { count: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    repo = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((data) => data),
      save: vi.fn().mockResolvedValue(undefined),
    };
    sendMock = vi.fn().mockResolvedValue(undefined);
    const mailProvider = { send: sendMock };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(EmailLog), useValue: repo },
        { provide: MAIL_PROVIDER, useValue: mailProvider },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue(3) },
        },
      ],
    }).compile();

    service = moduleRef.get(NotificationsService);
  });

  describe('CU-20 Enviar notificación por correo', () => {
    it('envía el mensaje y registra el log cuando todo es válido', async () => {
      const result = await service.send({
        userId: 'u1',
        recipientEmail: 'user@example.com',
        template: EmailTemplate.VERIFICACION,
        data: { token: 'abc' },
      });

      expect(result.status).toBe(EmailStatus.ENVIADO);
      expect(sendMock).toHaveBeenCalledOnce();
      expect(repo.save).toHaveBeenCalledOnce();
    });

    it('2a: no envía si el destinatario no tiene un email válido', async () => {
      const result = await service.send({
        recipientEmail: 'no-es-un-email',
        template: EmailTemplate.VERIFICACION,
      });

      expect(result.status).toBe(EmailStatus.FALLIDO);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('2b: no envía si la plantilla solicitada no existe', async () => {
      const result = await service.send({
        recipientEmail: 'user@example.com',
        template: 'plantilla_inexistente' as EmailTemplate,
      });

      expect(result.status).toBe(EmailStatus.FALLIDO);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('1a: omite el envío si ya alcanzó el máximo de la plantilla en la ventana', async () => {
      repo.count.mockResolvedValue(3);

      const result = await service.send({
        userId: 'u1',
        recipientEmail: 'user@example.com',
        template: EmailTemplate.VERIFICACION,
      });

      expect(result.status).toBe(EmailStatus.OMITIDO_POR_RATE_LIMIT);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('4a: registra el fallo si el proveedor de correo rechaza el envío, sin lanzar', async () => {
      sendMock.mockRejectedValue(new Error('smtp down'));

      const result = await service.send({
        userId: 'u1',
        recipientEmail: 'user@example.com',
        template: EmailTemplate.VERIFICACION,
      });

      expect(result.status).toBe(EmailStatus.FALLIDO);
    });
  });
});
