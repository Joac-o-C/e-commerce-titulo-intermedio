import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole, UserStatus } from './entities/user.entity.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repo = {
      findOne: vi.fn(),
      create: vi.fn((data) => data),
      save: vi.fn((data) => Promise.resolve({ id: 'user-1', ...data })),
      update: vi.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: ConfigService, useValue: { get: vi.fn().mockReturnValue(4) } },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('CU-01 Registrar usuario', () => {
    it('crea el usuario con rol cliente, estado pendiente y password hasheado', async () => {
      const user = await service.create({
        email: 'user@example.com',
        password: 'Password1',
        firstName: 'Ana',
        lastName: 'Gomez',
      });

      expect(user.role).toBe(UserRole.CLIENTE);
      expect(user.status).toBe(UserStatus.PENDIENTE_VERIFICACION);
      expect(user.passwordHash).not.toBe('Password1');
    });
  });

  describe('CU-07 Verificar correo', () => {
    it('activa la cuenta al verificar el correo', async () => {
      await service.markVerified('user-1');
      expect(repo.update).toHaveBeenCalledWith('user-1', { status: UserStatus.ACTIVA });
    });
  });

  describe('CU-08 Recuperar contraseña', () => {
    it('activa la cuenta si estaba pendiente al restablecer la contraseña', async () => {
      await service.activateViaPasswordReset('user-1');
      expect(repo.update).toHaveBeenCalledWith('user-1', { status: UserStatus.ACTIVA });
    });
  });
});
