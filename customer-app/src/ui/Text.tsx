import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { font, useTheme } from './theme';

type Variant = 'display' | 'title' | 'heading' | 'subheading' | 'body' | 'label' | 'caption' | 'overline';

const variants: Record<Variant, TextStyle> = {
  display: { fontSize: font.size.display, fontWeight: font.weight.heavy, letterSpacing: -0.6, lineHeight: 38 },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, letterSpacing: -0.4, lineHeight: 30 },
  heading: { fontSize: font.size.lg, fontWeight: font.weight.bold, letterSpacing: -0.2, lineHeight: 22 },
  subheading: { fontSize: font.size.md, fontWeight: font.weight.semibold, lineHeight: 20 },
  body: { fontSize: font.size.md, fontWeight: font.weight.regular, lineHeight: 21 },
  label: { fontSize: font.size.sm, fontWeight: font.weight.semibold, lineHeight: 18 },
  caption: { fontSize: font.size.xs, fontWeight: font.weight.regular, lineHeight: 16 },
  overline: { fontSize: 11, fontWeight: font.weight.bold, letterSpacing: 1, lineHeight: 14, textTransform: 'uppercase' },
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  muted?: boolean;
  subtle?: boolean;
  color?: string;
  center?: boolean;
}

/** Screen-reader headings: lets VoiceOver/TalkBack jump between sections. */
const HEADING_VARIANTS = new Set<Variant>(['display', 'title', 'heading']);

export function Text({ variant = 'body', muted, subtle, color, center, style, accessibilityRole, ...rest }: AppTextProps) {
  const theme = useTheme();
  return (
    <RNText
      accessibilityRole={accessibilityRole ?? (HEADING_VARIANTS.has(variant) ? 'header' : undefined)}
      {...rest}
      style={[variants[variant], { color: color ?? (subtle ? theme.textSubtle : muted ? theme.textMuted : theme.text) }, center && { textAlign: 'center' }, style]}
    />
  );
}
