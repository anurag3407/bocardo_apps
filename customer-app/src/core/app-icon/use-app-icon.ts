import { useEffect, useState, useCallback } from 'react';
import { useAppConfig } from '../app-config/use-app-config';
import {
  APP_ICONS,
  getActiveAppIcon,
  setAppIcon,
  syncCampaignAppIcon,
  type AppIconId,
} from './app-icon';

export function useActiveAppIcon() {
  const [activeIcon, setActiveIcon] = useState<AppIconId>('default');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void getActiveAppIcon().then((icon) => {
      if (mounted) {
        setActiveIcon(icon);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const changeIcon = useCallback(
    async (iconId: AppIconId | null) => {
      setLoading(true);
      const success = await setAppIcon(iconId);
      if (success) {
        setActiveIcon(iconId ?? 'default');
      }
      setLoading(false);
      return success;
    },
    []
  );

  return {
    activeIcon,
    loading,
    changeIcon,
    availableIcons: APP_ICONS,
  };
}

/**
 * Headless effect that silently synchronizes the app icon with backend campaign settings.
 */
export function AppIconSyncEffect() {
  const { data } = useAppConfig();

  useEffect(() => {
    if (data?.campaignIcon !== undefined) {
      void syncCampaignAppIcon(data.campaignIcon);
    }
  }, [data?.campaignIcon]);

  return null;
}
