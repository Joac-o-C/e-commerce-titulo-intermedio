import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity.js';
import { EmailLog, EmailStatus, EmailTemplate } from './entities/email-log.entity.js';
import { MAIL_PROVIDER, MailPermanentError } from './mail-provider.interface.js';
import { NotificationsService, RETRY_BACKOFF_MIN } from './notifications.service.js';

const CONFIG: Record<string, unknown> = {
  EMAIL_RATE_LIMIT_MAX_PER_HOUR: 3,
  FRONTEND_URL: 'http://front.test',
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: 24,
  PASSWORD_RESET_TOKEN_TTL_HOURS: 1,
  ORDER_RESERVATION_TTL_HOURS: 24,
};

/** La entrega corre en segundo plano (`void deliver()`): se espera a que se vacíe la cola de microtareas. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let userRepo: { findOne: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let sendMock: ReturnType<typeof vi.fn>;

  /** Cambios aplicados con `update(id, cambios)` a la fila del correo. */
  const rowUpdates = () => repo.update.mock.calls.map(([, changes]) => changes);
  const saved = () => repo.save.mock.calls.map(([row]) => row);

  const pendingRow = (overrides: Partial<EmailLog> = {}): EmailLog =>
    ({
      id: 'log-1',
      userId: 'u1',
      recipientEmail: 'user@example.com',
      template: EmailTemplate.RESULTADO_PAGO,
      status: EmailStatus.REINTENTANDO,
      attempts: 0,
      pendingMessage: { subject: 's', html: '<p>h</p>', text: 't' },
      ...overrides,
    }) as EmailLog;

  beforeEach(async () => {
    repo = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((data) => data),
      save: vi.fn(async (row) => ({ id: 'log-1', attempts: 0, ...row })),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      find: vi.fn().mockResolvedValue([]),
      findOneBy: vi.fn(),
    };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'u1', firstName: 'Ana' }),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    sendMock = vi.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(EmailLog), useValue: repo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: MAIL_PROVIDER, useValue: { send: sendMock } },
        { provide: ConfigService, useValue: { get: (key: string) => CONFIG[key] } },
      ],
    }).compile();

    service = moduleRef.get(NotificationsService);
  });

  describe('CU-20 Enviar notificación por correo', () => {
    it('acepta el correo sin esperar al proveedor y lo entrega en segundo plano', async () => {
      let release!: () => void;
      sendMock.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));

      const result = await service.send({
        userId: 'u1',
        recipientEmail: 'user@example.com',
        template: EmailTemplate.VERIFICACION,
        data: { token: 'abc' },
      });

      // El solicitante ya tiene respuesta aunque el proveedor todavía no contestó.
      expect(result.status).toBe(EmailStatus.PENDIENTE);
      expect(saved()[0]).toEqual(expect.objectContaining({ status: EmailStatus.PENDIENTE }));
      expect(rowUpdates()).toEqual([]);

      release();
      await flush();
      expect(rowUpdates()).toEqual([
        expect.objectContaining({ status: EmailStatus.ENVIADO, pendingMessage: null, sentAt: expect.any(Date) }),
      ]);
    });

    it('paso 3: compone el mensaje con la plantilla, el nombre del destinatario y el link', async () => {
      await service.send({
        userId: 'u1',
        recipientEmail: 'user@example.com',
        template: EmailTemplate.VERIFICACION,
        data: { token: 'abc' },
      });
      await flush();

      const message = sendMock.mock.calls[0][0];
      expect(message.to).toBe('user@example.com');
      expect(message.subject).toBe('Confirmá tu cuenta');
      expect(message.text).toContain('Hola Ana,');
      expect(message.text).toContain('http://front.test/verify-email?token=abc');
      expect(message.html).toContain('href="http://front.test/verify-email?token=abc"');
    });

    it('no guarda en claro el token de un solo uso en la auditoría', async () => {
      await service.send({
        userId: 'u1',
        recipientEmail: 'user@example.com',
        template: EmailTemplate.RESET_PASSWORD,
        data: { token: 'secreto' },
      });
      await flush();

      expect(saved()[0].payloadSnapshot).toEqual({ token: '[redactado]' });
      // El mensaje con el token sólo vive hasta que se entrega.
      expect(rowUpdates().at(-1)).toEqual(expect.objectContaining({ pendingMessage: null }));
    });

    it('2a: no envía si el destinatario no tiene un email válido', async () => {
      const result = await service.send({
        recipientEmail: 'no-es-un-email',
        template: EmailTemplate.VERIFICACION,
      });
      await flush();

      expect(result.status).toBe(EmailStatus.FALLIDO);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('2b: no envía si la plantilla solicitada no existe', async () => {
      const result = await service.send({
        recipientEmail: 'user@example.com',
        template: 'plantilla_inexistente' as EmailTemplate,
      });
      await flush();

      expect(result.status).toBe(EmailStatus.FALLIDO);
      expect(saved()[0].lastError).toBe('Plantilla inexistente');
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('1a: omite el envío si ya alcanzó el máximo de la plantilla en la ventana', async () => {
      repo.count.mockResolvedValue(3);

      const result = await service.send({
        userId: 'u1',
        recipientEmail: 'user@example.com',
        template: EmailTemplate.VERIFICACION,
      });
      await flush();

      expect(result.status).toBe(EmailStatus.OMITIDO_POR_RATE_LIMIT);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('1a: el límite de frecuencia no aplica a plantillas transaccionales (resultado de pago)', async () => {
      repo.count.mockResolvedValue(10);

      const result = await service.send({
        userId: 'u1',
        recipientEmail: 'user@example.com',
        template: EmailTemplate.RESULTADO_PAGO,
        data: { orderNumber: 1, resultado: 'rechazado' },
      });
      await flush();

      expect(result.status).toBe(EmailStatus.PENDIENTE);
      expect(repo.count).not.toHaveBeenCalled();
      expect(sendMock).toHaveBeenCalledOnce();
    });

    it('4a: si el proveedor falla, el solicitante no se entera y el correo queda para reintentar', async () => {
      sendMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.send({
        userId: 'u1',
        recipientEmail: 'user@example.com',
        template: EmailTemplate.RESULTADO_PAGO,
        data: { orderNumber: 1, resultado: 'pendiente' },
      });
      await flush();

      expect(result.status).toBe(EmailStatus.PENDIENTE);
      const [update] = rowUpdates();
      expect(update).toEqual(
        expect.objectContaining({ status: EmailStatus.REINTENTANDO, attempts: 1, lastError: 'ECONNREFUSED' }),
      );
      const waitMin = (update.nextAttemptAt.getTime() - Date.now()) / 60_000;
      expect(waitMin).toBeGreaterThan(RETRY_BACKOFF_MIN[0] - 1);
      expect(waitMin).toBeLessThanOrEqual(RETRY_BACKOFF_MIN[0]);
    });

    it('4a: cada reintento fallido espera más (5, 10, 20, 40, 80 min)', async () => {
      sendMock.mockRejectedValue(new Error('timeout'));
      repo.find.mockResolvedValue([{ id: 'log-1' }]);
      repo.findOneBy.mockResolvedValue(pendingRow({ attempts: 3 }));

      await service.retryPending();

      const update = rowUpdates().at(-1);
      expect(update).toEqual(expect.objectContaining({ status: EmailStatus.REINTENTANDO, attempts: 4 }));
      expect(Math.round((update.nextAttemptAt.getTime() - Date.now()) / 60_000)).toBe(40);
    });

    it('4a: agotados los 5 reintentos queda como fallido y se descarta el mensaje', async () => {
      sendMock.mockRejectedValue(new Error('timeout'));
      repo.find.mockResolvedValue([{ id: 'log-1' }]);
      repo.findOneBy.mockResolvedValue(pendingRow({ attempts: RETRY_BACKOFF_MIN.length }));

      await service.retryPending();

      expect(rowUpdates().at(-1)).toEqual(
        expect.objectContaining({ status: EmailStatus.FALLIDO, attempts: 6, pendingMessage: null, nextAttemptAt: null }),
      );
    });

    it('4a: un reintento exitoso deja el correo como enviado', async () => {
      repo.find.mockResolvedValue([{ id: 'log-1' }]);
      repo.findOneBy.mockResolvedValue(pendingRow({ attempts: 2 }));

      await service.retryPending();

      expect(sendMock).toHaveBeenCalledWith({ to: 'user@example.com', subject: 's', html: '<p>h</p>', text: 't' });
      expect(rowUpdates().at(-1)).toEqual(expect.objectContaining({ status: EmailStatus.ENVIADO, pendingMessage: null }));
    });

    it('4a: no reenvía un correo que otra ejecución ya reclamó', async () => {
      repo.find.mockResolvedValue([{ id: 'log-1' }]);
      repo.update.mockResolvedValueOnce({ affected: 0 });

      await service.retryPending();

      expect(repo.findOneBy).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('5a: un rebote se registra asociado a la cuenta y no se reintenta', async () => {
      sendMock.mockRejectedValue(new MailPermanentError('550 5.1.1 User unknown'));

      await service.send({
        userId: 'u1',
        recipientEmail: 'user@example.com',
        template: EmailTemplate.CANCELACION,
        data: { orderNumber: 1, total: '10.00' },
      });
      await flush();

      expect(rowUpdates()).toEqual([
        expect.objectContaining({ status: EmailStatus.REBOTADO, pendingMessage: null, nextAttemptAt: null }),
      ]);
      expect(userRepo.update).toHaveBeenCalledWith('u1', { emailBouncedAt: expect.any(Date) });
    });
  });
});
