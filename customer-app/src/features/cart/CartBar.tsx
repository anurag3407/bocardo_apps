import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatPaise } from '@/lib/format';
import { elevation, Icon, radius, spacing, Text, useTheme } from '@/ui';
import { cartCount, cartSubtotal, useCart } from './cart-store';

/** Floating "View cart" bar shown wherever the cart has items. */
export function CartBar() {
  const t = useTheme();
  const { lines, restaurantName } = useCart();
  if (!lines.length) return null;
  const count = cartCount(lines);
  return (
    <Pressable
      onPress={() => router.push('/cart')}
      style={({ pressed }) => [styles.bar, { backgroundColor: t.brand, opacity: pressed ? 0.9 : 1 }, elevation(3, t)]}
      accessibilityRole="button"
      accessibilityLabel={`View cart, ${count} items`}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="subheading" color={t.textInverse} style={{ fontWeight: '800' }}>
          {count} item{count > 1 ? 's' : ''} · {formatPaise(cartSubtotal(lines))}
        </Text>
        <Text variant="caption" color={t.textInverse} style={{ opacity: 0.85 }} numberOfLines={1}>From {restaurantName}</Text>
      </View>
      <View style={styles.cta}>
        <Text variant="subheading" color={t.textInverse} style={{ fontWeight: '800' }}>View cart</Text>
        <Icon name="bag-handle" size={18} color={t.textInverse} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
