import { useEffect } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../api/http-client';
import { env } from '../config/env';

interface AppConfig {
  minVersion: string;
  latestVersion?: string | null;
  apkUrl?: string | null;
  releaseNotes?: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  campaignIcon?: string | null;
}

const toParts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);

export function isOlder(current: string, target: string): boolean {
  const [a, b] = [toParts(current), toParts(target)];
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

/** Remote config + in-app / forced-update check, fetched on launch and foreground. */
export function useAppConfig() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: ['app-config', env.app] });
    });
    return () => sub.remove();
  }, [queryClient]);

  const query = useQuery({
    queryKey: ['app-config', env.app],
    queryFn: () => httpClient<AppConfig>(`/app-config/${env.app}`),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: true,
  });

  const currentVersion = Constants.expoConfig?.version ?? '0.0.0';
  // Trial/alpha builds (0.0.x) aren't blocked by Play Store 1.0.0 minimums until an APK release sets apkUrl.
  const isTrial = currentVersion.startsWith('0.0.') || currentVersion === '0.0.0';
  const data = query.data;
  const latestVersion = data?.latestVersion ?? null;
  const apkUrl = data?.apkUrl ?? null;
  const releaseNotes = data?.releaseNotes ?? null;
  const updateAvailable = Boolean(latestVersion && apkUrl && isOlder(currentVersion, latestVersion));
  const updateRequired = Boolean(data && (apkUrl ? isOlder(currentVersion, data.minVersion) : !isTrial && isOlder(currentVersion, data.minVersion)));

  return {
    ...query,
    currentVersion,
    latestVersion,
    apkUrl,
    releaseNotes,
    updateAvailable,
    updateRequired,
  };
}
