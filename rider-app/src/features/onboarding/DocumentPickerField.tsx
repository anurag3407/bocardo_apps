import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { pickDocumentImage, uploadRiderDocument, type RiderDocumentType } from '@/core/storage/document-upload';
import { Badge, Card, Icon, radius, Row, spacing, Text, useTheme } from '@/ui';

interface DocumentPickerFieldProps {
  label: string;
  hint: string;
  docType: RiderDocumentType;
  userId: string;
  currentPath?: string | null;
  onUploaded: (path: string) => void;
  required?: boolean;
}

export function DocumentPickerField({
  label,
  hint,
  docType,
  userId,
  currentPath,
  onUploaded,
  required = false,
}: DocumentPickerFieldProps) {
  const t = useTheme();
  const [uploading, setUploading] = useState(false);

  const handlePick = async () => {
    try {
      const uri = await pickDocumentImage();
      if (!uri) return;
      setUploading(true);
      const path = await uploadRiderDocument(userId, docType, uri);
      onUploaded(path);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Upload Error', msg);
    } finally {
      setUploading(false);
    }
  };

  const isUploaded = !!currentPath;

  return (
    <Card style={{ gap: spacing.sm, backgroundColor: t.surfaceRaised }}>
      <Row justify="space-between" style={{ alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={spacing.xs} style={{ alignItems: 'center' }}>
            <Text variant="label" style={{ fontWeight: '600' }}>{label}</Text>
            {required ? <Text color={t.danger}>*</Text> : <Text variant="caption" muted>(Optional)</Text>}
          </Row>
          <Text variant="caption" muted>{hint}</Text>
        </View>

        {uploading ? (
          <ActivityIndicator color={t.brand} size="small" />
        ) : isUploaded ? (
          <Pressable onPress={handlePick} style={styles.actionBtn}>
            <Badge label="Uploaded" tone="lime" icon="checkmark-circle" />
            <Text variant="caption" color={t.brandText} style={{ fontWeight: '600', marginLeft: spacing.xs }}>Change</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handlePick}
            style={[styles.uploadButton, { backgroundColor: t.brandSoft, borderColor: t.brand }]}>
            <Icon name="camera-outline" size={16} color={t.brandText} />
            <Text variant="caption" color={t.brandText} style={{ fontWeight: '700' }}>Upload</Text>
          </Pressable>
        )}
      </Row>
      {isUploaded ? (
        <Row gap={spacing.xs} style={{ alignItems: 'center' }}>
          <Icon name="document-text-outline" size={14} color={t.textMuted} />
          <Text variant="caption" muted numberOfLines={1} style={{ flex: 1, fontSize: 11 }}>
            {currentPath}
          </Text>
        </Row>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
