import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AutocompleteQuerySchema = z.object({
  query: z.string().min(2).max(120),
  sessionToken: z.string().uuid(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
export class AutocompleteQueryDto extends createZodDto(AutocompleteQuerySchema) {}

export const PlaceDetailsQuerySchema = z.object({
  placeId: z.string().min(3).max(200),
  sessionToken: z.string().uuid().optional(),
});
export class PlaceDetailsQueryDto extends createZodDto(PlaceDetailsQuerySchema) {}

export const ReverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export class ReverseGeocodeQueryDto extends createZodDto(ReverseGeocodeQuerySchema) {}

export interface PlacePrediction {
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
}

export interface GeocodedPlace {
  label: string;
  line1: string;
  city: string | null;
  pincode: string | null;
  lat: number;
  lng: number;
}
