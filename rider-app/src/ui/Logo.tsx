import { Image } from 'expo-image';
import { View } from 'react-native';
import { Text } from './Text';
import { spacing, useTheme } from './theme';

const mark = require('../../assets/images/logo.png');

/** The Bocardo disc mark, optionally with the lowercase wordmark and a product tag ("partner", "rider"). */
export function Logo({ size = 40, wordmark, tag, inverse }: { size?: number; wordmark?: boolean; tag?: string; inverse?: boolean }) {
  const t = useTheme();
  const ink = inverse ? t.textInverse : t.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Image source={mark} style={{ width: size, height: size }} contentFit="contain" accessibilityLabel="Bocardo" />
      {wordmark ? (
        <View>
          <Text style={{ fontSize: size * 0.62, fontWeight: '900', letterSpacing: -1, color: ink, lineHeight: size * 0.72 }}>bocardo</Text>
          {tag ? <Text variant="overline" color={inverse ? t.textInverse : t.brandText}>{tag}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
