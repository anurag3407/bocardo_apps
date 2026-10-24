import { Platform, useColorScheme, type ViewStyle } from 'react-native';

/**
 * Bocardo design tokens, derived from the logo: sky blue disc, lime + sunflower bowls, ink outline.
 * Components read colors only from here.
 *  - `brand` fills CTAs (white text on it passes 3:1 for bold labels)
 *  - `brandText` is the blue for small text and icons on light surfaces (passes 4.5:1)
 *  - `sky` / `lime` / `sun` are the logo colors, used for hero areas and highlights with `ink` text
 */
const palette = {
  sky: '#6CDCF9',
  lime: '#B4F55A',
  sun: '#FFD452',
  ink: '#0B1B26',
  brand: '#0596D1',
  rating: '#1E8E3E',
  success: '#15924F',
  warning: '#E08A00',
  danger: '#E03A45',
  veg: '#0F8A43',
  nonVeg: '#B5361F',
};

export const colors = {
  light: {
    ...palette,
    brandText: '#0672A3',
    brandSoft: '#E8F8FE',
    skySoft: '#F1FBFF',
    limeSoft: '#F2FDE4',
    sunSoft: '#FFF7DB',
    successSoft: '#E7F6EE',
    warningSoft: '#FFF4E0',
    dangerSoft: '#FDECEE',
    background: '#FFFFFF',
    surface: '#F3F6F8',
    surfaceRaised: '#FFFFFF',
    border: '#E4E9ED',
    text: '#0B1B26',
    textMuted: '#5B6B77',
    textSubtle: '#8D9AA5',
    textInverse: '#FFFFFF',
    overlay: 'rgba(11,27,38,0.5)',
    shadow: '#0B1B26',
  },
  dark: {
    ...palette,
    brandText: '#6CDCF9',
    brandSoft: '#0D2B38',
    skySoft: '#0F2430',
    limeSoft: '#1D2A10',
    sunSoft: '#2E2610',
    successSoft: '#0F2A1C',
    warningSoft: '#2E2210',
    dangerSoft: '#341519',
    background: '#0B1117',
    surface: '#131B22',
    surfaceRaised: '#18222B',
    border: '#24313B',
    text: '#EEF3F6',
    textMuted: '#9CABB6',
    textSubtle: '#6E7E8A',
    textInverse: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.6)',
    shadow: '#000000',
  },
} as const;

export type ThemeColors = { [K in keyof typeof colors.light]: string };

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 } as const;
export const font = {
  size: { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, display: 32 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' },
} as const;

/** Soft, wide shadows (Swiggy-style cards float instead of being outlined). */
export function elevation(level: 1 | 2 | 3, t: ThemeColors): ViewStyle {
  const spec = { 1: [2, 8, 0.06, 2], 2: [6, 16, 0.08, 4], 3: [12, 28, 0.14, 10] }[level];
  return Platform.select<ViewStyle>({
    android: { elevation: spec[3], shadowColor: t.shadow },
    default: { shadowColor: t.shadow, shadowOffset: { width: 0, height: spec[0] }, shadowRadius: spec[1], shadowOpacity: spec[2] },
  });
}

export function useTheme(): ThemeColors {
  return colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
