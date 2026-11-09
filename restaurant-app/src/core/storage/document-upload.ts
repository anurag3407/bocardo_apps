import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../auth/supabase';

const BUCKET = 'kyc-documents';

export type DocumentType = 'fssai' | 'pan' | 'gst' | 'cheque';

/**
 * Lets the merchant pick or snap a clear photo/scan of their document
 * (FSSAI licence, PAN card, GSTIN certificate, or Cancelled Cheque).
 */
export async function pickDocumentImage(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Photo library permission is needed to select documents');
    }
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
 * Supabase storage RLS enforces that users can only write into their own folder.
 * Returns the storage path to attach to the onboarding application.
 */
export async function uploadDocument(
  userId: string,
  docType: DocumentType,
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
