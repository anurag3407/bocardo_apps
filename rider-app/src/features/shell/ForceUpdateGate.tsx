import { useState, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppConfig } from '@/core/app-config/use-app-config';
import { Button, EmptyState, Icon, IconButton, Screen, spacing, Text, useTheme } from '@/ui';

const STORE_URL = Platform.select({ ios: 'https://apps.apple.com/app/id0000000000', default: 'market://details?id=app.bocardo.rider' });

/** Blocks forced updates and surfaces an in-app Update button whenever a newer APK is published. */
export function ForceUpdateGate({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const { updateRequired, updateAvailable, latestVersion, apkUrl, releaseNotes } = useAppConfig();
  const targetUrl = apkUrl ?? STORE_URL;

  if (updateRequired) {
    const versionHint = latestVersion ? `Version ${latestVersion} is required to continue.` : 'A newer version of Bocardo Rider is available.';
    const message = releaseNotes ? `${versionHint}\n\n${releaseNotes}` : `${versionHint} Please update to continue.`;
    return (
      <Screen>
        <EmptyState icon="rocket-outline" title="Update required" message={message} action={{ label: 'Update now', onPress: () => void Linking.openURL(targetUrl) }} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {updateAvailable && apkUrl && !dismissed ? (
        <View style={[styles.banner, { paddingTop: Math.max(insets.top, spacing.sm) + spacing.xs, backgroundColor: t.brandSoft, borderBottomColor: t.border }]}>
          <Icon name="cloud-download-outline" size={20} color={t.brandText} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="subheading" numberOfLines={1}>Update v{latestVersion} available</Text>
            <Text variant="caption" muted numberOfLines={1}>{releaseNotes || 'Tap Update to download the latest APK'}</Text>
          </View>
          <Button title="Update" size="sm" onPress={() => void Linking.openURL(apkUrl)} />
          <IconButton name="close" label="Dismiss update" size={32} onPress={() => setDismissed(true)} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
});
