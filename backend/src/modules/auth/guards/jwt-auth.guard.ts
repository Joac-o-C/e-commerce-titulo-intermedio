import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Exige un access token válido (JwtStrategy). Endpoints de sesión iniciada. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
