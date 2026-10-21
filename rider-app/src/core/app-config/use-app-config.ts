import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import { httpClient } from '../api/http-client';
import { env } from '../config/env';

interface AppConfig {
  minVersion: string;
  supportPhone: string | null;
  supportEmail: string | null;
}

const toParts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);

export function isOlder(current: string, min: string): boolean {
  const [a, b] = [toParts(current), toParts(min)];
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

/** Remote config + forced-update check, fetched on launch. */
export function useAppConfig() {
  const query = useQuery({
    queryKey: ['app-config', env.app],
    queryFn: () => httpClient<AppConfig>(`/app-config/${env.app}`),
    staleTime: 10 * 60_000,
  });
  const current = Constants.expoConfig?.version ?? '0.0.0';
  return { ...query, updateRequired: query.data ? isOlder(current, query.data.minVersion) : false };
}
