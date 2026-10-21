import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../auth/supabase';

const BUCKET = 'delivery-proofs';

export class CameraPermissionError extends Error {
  constructor() {
    super('Camera access is needed to photograph the delivered package');
  }
}

/** Opens the camera (no gallery: the photo must be taken at the door, now). */
export async function captureDoorstepPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new CameraPermissionError();
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4, exif: false, allowsEditing: false });
  return result.canceled ? null : result.assets[0].uri;
}

/**
 * Uploads to the private `delivery-proofs` bucket under `<riderId>/<orderId>/` — storage RLS
 * only lets a rider write into their own folder; the API verifies the path on delivery.
 */
export async function uploadDoorstepPhoto(riderId: string, orderId: string, uri: string): Promise<string> {
  const path = `${riderId}/${orderId}/${Date.now()}.jpg`;
  const body = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return path;
}
