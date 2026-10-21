import { Text as RNText, type TextProps } from 'react-native';
import { font, useTheme } from './theme';

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption';

const variants: Record<Variant, { fontSize: number; fontWeight: (typeof font.weight)[keyof typeof font.weight] }> = {
  title: { fontSize: font.size.xxl, fontWeight: font.weight.bold },
  heading: { fontSize: font.size.lg, fontWeight: font.weight.semibold },
  body: { fontSize: font.size.md, fontWeight: font.weight.regular },
  label: { fontSize: font.size.sm, fontWeight: font.weight.semibold },
  caption: { fontSize: font.size.xs, fontWeight: font.weight.regular },
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  muted?: boolean;
  color?: string;
  center?: boolean;
}

export function Text({ variant = 'body', muted, color, center, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      style={[variants[variant], { color: color ?? (muted ? theme.textMuted : theme.text) }, center && { textAlign: 'center' }, style]}
    />
  );
}
