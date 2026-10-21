export type AppRole = 'customer' | 'restaurant' | 'rider' | 'admin';
export type AdminRole = 'super_admin' | 'ops' | 'support' | 'finance';

/** The authenticated caller, derived from a verified Supabase access token. */
export interface AuthUser {
  id: string;
  roles: AppRole[];
  adminRole: AdminRole | null;
  phone?: string;
  email?: string;
}
