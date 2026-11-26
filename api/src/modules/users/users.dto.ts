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
    latestVersion: z.string().nullable().optional(),
    apkUrl: z.string().nullable().optional(),
    releaseNotes: z.string().nullable().optional(),
    supportPhone: z.string().nullable(),
    supportEmail: z.string().nullable(),
    campaignIcon: z.string().nullable().optional(),
  }),
) {}

export class PublishReleaseDto extends createZodDto(
  z.object({
    app: z.enum(['customer', 'restaurant', 'rider']),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver x.y.z'),
    versionCode: z.number().int().positive(),
    apkUrl: z.url(),
    minVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
    force: z.boolean().default(false),
    releaseNotes: z.string().trim().max(500).optional(),
  }),
) {}

export class DeletionRequestDto extends createZodDto(
  z.object({
    phone: z.string().trim().min(10).max(20),
    app: z.enum(['customer', 'restaurant', 'rider']),
    reason: z.string().trim().max(500).optional(),
  }),
) {}
