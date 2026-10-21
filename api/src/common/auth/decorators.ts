import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AdminRole, AppRole, AuthUser } from './auth-user';

export const IS_PUBLIC = 'auth:isPublic';
export const ROLES = 'auth:roles';
export const ADMIN_ROLES = 'auth:adminRoles';

/** Skip authentication (catalogue browsing, webhooks, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Caller must hold at least one of these app roles. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES, roles);

/** Caller must be an admin with one of these admin roles (super_admin always passes). */
export const AdminRoles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
