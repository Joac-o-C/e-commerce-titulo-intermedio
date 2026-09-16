import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface OpaqueToken {
  /** Valor en texto plano: se envía por email o se setea como cookie. Nunca se persiste. */
  plain: string;
  /** sha256 del valor en texto plano: lo único que se persiste en DB. */
  hash: string;
}

/**
 * Genera y verifica los tokens opacos usados por refresh sessions,
 * verificación de email y reset de contraseña — mismo esquema en los tres
 * casos: valor aleatorio + hash sha256 sin salt. Sin salt es deliberado:
 * el hash queda determinístico y por lo tanto buscable directo por
 * columna (`WHERE token_hash = :hash`), sin necesitar iterar candidatos.
 */
@Injectable()
export class TokenService {
  generateOpaqueToken(): OpaqueToken {
    const plain = randomBytes(32).toString('hex');
    return { plain, hash: this.hashToken(plain) };
  }

  hashToken(plain: string): string {
    return createHash('sha256').update(plain).digest('hex');
  }
}
