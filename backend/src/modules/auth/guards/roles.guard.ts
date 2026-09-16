import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/entities/user.entity.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { JwtAccessPayload } from '../strategies/jwt.strategy.js';

/**
 * Scaffolding para Fase 2 en adelante (no hay endpoints admin todavía en
 * Fase 1). Requiere correr después de JwtAuthGuard, que puebla req.user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    return !!user && requiredRoles.includes(user.role as UserRole);
  }
}
