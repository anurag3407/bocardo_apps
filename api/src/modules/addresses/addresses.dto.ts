import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AddressFields = z.object({
  label: z.enum(['home', 'work', 'other']).default('home'),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).nullish(),
  landmark: z.string().trim().max(120).nullish(),
  city: z.string().trim().max(80).nullish(),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .nullish(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
});

export class CreateAddressDto extends createZodDto(AddressFields) {}
export class UpdateAddressDto extends createZodDto(AddressFields.partial()) {}

export const AddressSchema = z
  .object({
    id: z.string(),
    label: z.enum(['home', 'work', 'other']),
    line1: z.string(),
    line2: z.string().nullable(),
    landmark: z.string().nullable(),
    city: z.string().nullable(),
    pincode: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
    isDefault: z.boolean(),
    serviceable: z.boolean(),
  })
  .meta({ id: 'Address' });

export class AddressDto extends createZodDto(AddressSchema.clone()) {}
export class AddressListDto extends createZodDto(z.array(AddressSchema)) {}
