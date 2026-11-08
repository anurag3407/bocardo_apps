import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../auth/supabase';

const BUCKET = 'kyc-documents';

export type RiderDocumentType =
  | 'aadhaar_front'
  | 'aadhaar_back'
  | 'pan'
  | 'license_front'
  | 'license_back'
  | 'rc'
  | 'cheque';

/**
 * Lets the rider pick or snap a clear photo/scan of their document
 * (Aadhaar, PAN, Driving Licence, Vehicle RC, or Cancelled Cheque/Passbook).
 */
export async function pickDocumentImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is needed to select documents');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: true,
  });

  return result.canceled ? null : result.assets[0].uri;
}

/**
 * Uploads to the private `kyc-documents` bucket under `<userId>/<docType>_<timestamp>.jpg`.
 * Supabase storage RLS enforces that riders can only write into their own folder.
 * Returns the storage path to attach to the rider application.
 */
export async function uploadRiderDocument(
  userId: string,
  docType: RiderDocumentType,
  uri: string,
): Promise<string> {
  const fileName = `${docType}_${Date.now()}.jpg`;
  const path = `${userId}/${fileName}`;
  const response = await fetch(uri);
  const blob = await response.arrayBuffer();

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (error) {
    throw new Error(`Document upload failed: ${error.message}`);
  }

  return path;
}
