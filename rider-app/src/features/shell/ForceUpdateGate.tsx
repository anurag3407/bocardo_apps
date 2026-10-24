import type { ReactNode } from 'react';
import { Linking, Platform } from 'react-native';
import { useAppConfig } from '@/core/app-config/use-app-config';
import { EmptyState, Screen } from '@/ui';

const STORE_URL = Platform.select({ ios: 'https://apps.apple.com/app/id0000000000', default: 'market://details?id=app.bocardo.rider' });

/** Blocks the app when the installed version is below the server's minimum. */
export function ForceUpdateGate({ children }: { children: ReactNode }) {
  const { updateRequired } = useAppConfig();
  if (!updateRequired) return <>{children}</>;
  return (
    <Screen>
      <EmptyState icon="rocket-outline" title="Update required" message="A newer version of Bocardo is available. Please update to continue." action={{ label: 'Update now', onPress: () => Linking.openURL(STORE_URL) }} />
    </Screen>
  );
}
