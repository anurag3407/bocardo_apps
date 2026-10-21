import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ProfileSchema = z
  .object({
    id: z.string(),
    fullName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    roles: z.array(z.enum(['customer', 'restaurant', 'rider', 'admin'])),
    adminRole: z.enum(['super_admin', 'ops', 'support', 'finance']).nullable(),
  })
  .meta({ id: 'Profile' });

export class ProfileDto extends createZodDto(ProfileSchema.clone()) {}

export class UpdateProfileDto extends createZodDto(
  z.object({
    fullName: z.string().trim().min(1).max(80).optional(),
    email: z.email().optional(),
    avatarUrl: z.url().optional(),
  }),
) {}

export class RegisterDeviceDto extends createZodDto(
  z.object({
    app: z.enum(['customer', 'restaurant', 'rider', 'admin']),
    token: z.string().min(10).max(4096),
    platform: z.enum(['ios', 'android', 'web']),
  }),
) {}

export class AppConfigDto extends createZodDto(
  z.object({
    minVersion: z.string(),
    supportPhone: z.string().nullable(),
    supportEmail: z.string().nullable(),
  }),
) {}
