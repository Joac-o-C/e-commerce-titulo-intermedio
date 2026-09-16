import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from './entities/user.entity.js';

export interface CreateUserParams {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * Dueño de la entidad User y de su ciclo de vida (creación, hash de
 * contraseña, transiciones de estado). AuthService la usa por inyección;
 * nunca accede al repositorio de User directamente.
 */
@Injectable()
export class UsersService {
  private readonly saltRounds: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    configService: ConfigService,
  ) {
    this.saltRounds = configService.get<number>('BCRYPT_SALT_ROUNDS')!;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  /**
   * @usecase CU-01 Registrar usuario
   */
  async create(params: CreateUserParams): Promise<User> {
    const passwordHash = await bcrypt.hash(params.password, this.saltRounds);
    const user = this.userRepo.create({
      email: params.email,
      passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      role: UserRole.CLIENTE,
      status: UserStatus.PENDIENTE_VERIFICACION,
    });
    return this.userRepo.save(user);
  }

  verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);
    await this.userRepo.update(userId, { passwordHash });
  }

  /**
   * CU-07: la cuenta pasa de pendiente_verificacion a activa al confirmar
   * el enlace de verificación de correo.
   * @usecase CU-07 Verificar correo
   */
  async markVerified(userId: string): Promise<void> {
    await this.userRepo.update(userId, { status: UserStatus.ACTIVA });
  }

  /**
   * CU-08: si la cuenta estaba pendiente_verificacion, un restablecimiento
   * de contraseña exitoso también la activa (mismo destino que markVerified,
   * nombre distinto para trazar de dónde vino la transición).
   * @usecase CU-08 Recuperar contraseña
   */
  async activateViaPasswordReset(userId: string): Promise<void> {
    await this.userRepo.update(userId, { status: UserStatus.ACTIVA });
  }
}
