import { getAppIcon, setAppIcon as setNativeAppIcon } from '@mozzius/expo-dynamic-app-icon';
import { kv } from '../storage/kv';

export type AppIconId = 'default' | 'diwali' | 'midnight' | 'gold';

export interface AppIconOption {
  id: AppIconId;
  name: string;
  subtitle: string;
  badge?: string;
  preview: number;
}

export const APP_ICONS: AppIconOption[] = [
  {
    id: 'default',
    name: 'Bocardo Classic',
    subtitle: 'Signature sky-blue & sunny lime bowl',
    preview: require('../../../assets/images/icon.png'),
  },
  {
    id: 'diwali',
    name: 'Diwali Festive',
    subtitle: 'Warm festive marigold & golden accents',
    badge: 'Festival',
    preview: require('../../../assets/images/icons/icon-diwali.png'),
  },
  {
    id: 'midnight',
    name: 'Midnight Mode',
    subtitle: 'Obsidian night with glowing neon cyan',
    badge: 'Night',
    preview: require('../../../assets/images/icons/icon-midnight.png'),
  },
  {
    id: 'gold',
    name: 'VIP Gold Club',
    subtitle: 'Lustrous metallic champagne gold & carbon',
    badge: 'Exclusive',
    preview: require('../../../assets/images/icons/icon-gold.png'),
  },
];

const USER_MANUAL_OVERRIDE_KEY = 'user_selected_app_icon';

/**
 * Returns the currently active icon identifier ('default' | 'diwali' | 'midnight' | 'gold').
 */
export async function getActiveAppIcon(): Promise<AppIconId> {
  const saved = (await kv.getItem(USER_MANUAL_OVERRIDE_KEY)) as AppIconId | null;

  try {
    const raw = getAppIcon();
    if (!raw || raw === 'DEFAULT') return 'default';
    const normalized = String(raw).toLowerCase() as AppIconId;
    if (['diwali', 'midnight', 'gold'].includes(normalized)) {
      return normalized;
    }
    return 'default';
  } catch {
    return saved || 'default';
  }
}

/**
 * Sets the active app icon. Pass `null` or `'default'` to revert to original.
 */
export async function setAppIcon(iconId: AppIconId | null): Promise<boolean> {
  const targetId = !iconId || iconId === 'default' ? null : iconId;

  // Remember preference locally
  await kv.setItem(USER_MANUAL_OVERRIDE_KEY, targetId ?? 'default');

  try {
    const result = setNativeAppIcon(targetId);
    return result !== false;
  } catch (e) {
    console.warn('[AppIcon] Failed to change app icon:', e);
    return false;
  }
}

/**
 * Synchronizes the app icon with a remote campaign icon (e.g. from Remote Config / API).
 * If the user has manually customized their icon, we do not override it unless forced.
 */
export async function syncCampaignAppIcon(campaignIcon?: string | null, force = false): Promise<void> {
  if (!campaignIcon) return;

  const userSelected = await kv.getItem(USER_MANUAL_OVERRIDE_KEY);
  if (!force && userSelected && userSelected !== 'default') {
    // User explicitly customized their icon, don't overwrite
    return;
  }

  const validIcons: AppIconId[] = ['diwali', 'midnight', 'gold', 'default'];
  const target = campaignIcon.toLowerCase() as AppIconId;
  if (!validIcons.includes(target)) return;

  const current = await getActiveAppIcon();
  if (current !== target) {
    await setAppIcon(target);
  }
}
