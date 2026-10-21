import { useColorScheme } from 'react-native';

/** Bocardo design tokens. Components read colors only from here. */
const palette = {
  brand: '#FF5A1F',
  success: '#1BA672',
  warning: '#F5A623',
  danger: '#E23744',
  veg: '#0F8A43',
  nonVeg: '#B5361F',
};

export const colors = {
  light: {
    ...palette,
    brandSoft: '#FFF0EA',
    background: '#FFFFFF',
    surface: '#F7F7F8',
    surfaceRaised: '#FFFFFF',
    border: '#E6E6EA',
    text: '#14151A',
    textMuted: '#62656F',
    textInverse: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.45)',
  },
  dark: {
    ...palette,
    brandSoft: '#3A1D12',
    background: '#0E0F12',
    surface: '#17181C',
    surfaceRaised: '#1F2026',
    border: '#2C2E35',
    text: '#F4F4F6',
    textMuted: '#A3A6B0',
    textInverse: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.6)',
  },
} as const;

export type ThemeColors = { [K in keyof typeof colors.light]: string };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const font = {
  size: { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
} as const;

export function useTheme(): ThemeColors {
  return colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
