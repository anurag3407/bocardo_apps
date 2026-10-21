export type AdminRole = 'super_admin' | 'ops' | 'support' | 'finance';

export interface AdminClaims {
  sub: string;
  email?: string;
  app_roles?: string[];
  admin_role?: AdminRole | null;
}

export const isAdmin = (c: AdminClaims | null | undefined) => !!c?.app_roles?.includes('admin') && !!c.admin_role;

/** Mirrors the API's @AdminRoles checks so the UI only shows what the user can do. */
export function can(role: AdminRole | null | undefined, ...allowed: AdminRole[]) {
  return role === 'super_admin' || (!!role && allowed.includes(role));
}
