import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { formatPaise } from '@/lib/format';
import { radius, Row, spacing, Text, useTheme } from '@/ui';
import { cartCount, cartSubtotal, useCart } from './cart-store';

/** Floating "View cart" bar shown wherever the cart has items. */
export function CartBar() {
  const t = useTheme();
  const { lines, restaurantName } = useCart();
  if (!lines.length) return null;
  const count = cartCount(lines);
  return (
    <Pressable onPress={() => router.push('/cart')} style={[styles.bar, { backgroundColor: t.brand }]} accessibilityRole="button">
      <Row justify="space-between">
        <Text variant="label" color={t.textInverse}>
          {count} item{count > 1 ? 's' : ''} · {formatPaise(cartSubtotal(lines))}
        </Text>
        <Text variant="label" color={t.textInverse}>View cart ›</Text>
      </Row>
      <Text variant="caption" color={t.textInverse} numberOfLines={1}>from {restaurantName}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, borderRadius: radius.lg, padding: spacing.md, gap: 2 },
});
