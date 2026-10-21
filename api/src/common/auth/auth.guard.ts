import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error';
import type { AdminRole, AppRole, AuthUser } from './auth-user';
import { ADMIN_ROLES, IS_PUBLIC, ROLES } from './decorators';
import { TokenVerifier } from './token-verifier';

/** Global guard: authenticates every route unless marked @Public(), then enforces @Roles/@AdminRoles. */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw AppError.unauthorized();

    let user: Awaited<ReturnType<TokenVerifier['verify']>>;
    try {
      user = await this.verifier.verify(header.slice('Bearer '.length));
    } catch (err) {
      this.logger.debug(`token rejected: ${(err as Error).message}`);
      throw AppError.unauthorized('Session expired, please sign in again');
    }
    if (user.isBlocked) throw AppError.forbidden('This account has been blocked');
    request.user = user;

    const roles = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.some((r) => user.roles.includes(r))) throw AppError.forbidden();

    const adminRoles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(
      ADMIN_ROLES,
      targets,
    );
    if (adminRoles) {
      const isAdmin = user.roles.includes('admin') && user.adminRole !== null;
      const allowed =
        user.adminRole === 'super_admin' ||
        (user.adminRole !== null && adminRoles.includes(user.adminRole));
      if (!isAdmin || !allowed) throw AppError.forbidden();
    }
    return true;
  }
}
