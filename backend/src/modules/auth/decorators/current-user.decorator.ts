import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtAccessPayload } from '../strategies/jwt.strategy.js';

/** Extrae el payload del access token puesto por JwtAuthGuard en req.user. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtAccessPayload => {
    return ctx.switchToHttp().getRequest<{ user: JwtAccessPayload }>().user;
  },
);
