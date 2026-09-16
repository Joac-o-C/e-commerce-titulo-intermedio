import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LoginAttempt } from '../entities/login-attempt.entity.js';
import {
  AccountLockedException,
  IpLockedException,
  LoginThrottleService,
} from './login-throttle.service.js';

const CONFIG: Record<string, number> = {
  LOGIN_ACCOUNT_MAX_ATTEMPTS: 5,
  LOGIN_ACCOUNT_LOCKOUT_WINDOW_MIN: 15,
  LOGIN_IP_MAX_ATTEMPTS: 20,
  LOGIN_IP_LOCKOUT_WINDOW_MIN: 15,
};

describe('LoginThrottleService', () => {
  let service: LoginThrottleService;
  let repo: { count: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repo = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((data) => data),
      save: vi.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LoginThrottleService,
        { provide: getRepositoryToken(LoginAttempt), useValue: repo },
        { provide: ConfigService, useValue: { get: vi.fn((key: string) => CONFIG[key]) } },
      ],
    }).compile();

    service = moduleRef.get(LoginThrottleService);
  });

  describe('CU-06 Iniciar sesión', () => {
    it('no lanza si la cuenta y la IP están por debajo del máximo', async () => {
      await expect(service.assertNotLocked('user@example.com', '1.2.3.4')).resolves.toBeUndefined();
    });

    it('5a: bloquea la cuenta tras 5 intentos fallidos en 15 minutos', async () => {
      repo.count.mockResolvedValueOnce(5);

      await expect(service.assertNotLocked('user@example.com', '1.2.3.4')).rejects.toBeInstanceOf(
        AccountLockedException,
      );
    });

    it('5a: bloquea la IP tras 20 intentos fallidos en 15 minutos', async () => {
      repo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(20);

      await expect(service.assertNotLocked('user@example.com', '1.2.3.4')).rejects.toBeInstanceOf(
        IpLockedException,
      );
    });

    it('registra cada intento con su resultado', async () => {
      await service.recordAttempt('user@example.com', '1.2.3.4', false);

      expect(repo.save).toHaveBeenCalledOnce();
      expect(repo.create).toHaveBeenCalledWith({
        email: 'user@example.com',
        ipAddress: '1.2.3.4',
        success: false,
      });
    });
  });
});
