import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MenuItem } from '@/core/api/generated/model';
import { formatPaise } from '@/lib/format';
import { Badge, radius, Row, spacing, Text, useTheme, VegMark } from '@/ui';

export function MenuItemRow({ item, quantity, disabled, onAdd, onRemove }: { item: MenuItem; quantity: number; disabled: boolean; onAdd: () => void; onRemove: () => void }) {
  const t = useTheme();
  const fromPrice = item.variants.length ? Math.min(...item.variants.map((v) => v.pricePaise)) : item.pricePaise;
  const unavailable = !item.inStock || disabled;

  return (
    <View style={[styles.row, { borderBottomColor: t.border }]}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Row>
          <VegMark veg={item.isVeg} />
          {item.isBestseller ? <Badge label="Bestseller" tone="warning" /> : null}
        </Row>
        <Text variant="heading">{item.name}</Text>
        <Text>{item.variants.length ? `from ${formatPaise(fromPrice)}` : formatPaise(fromPrice)}</Text>
        {item.description ? <Text variant="caption" muted numberOfLines={2}>{item.description}</Text> : null}
        {item.variants.length || item.addonGroups.length ? <Text variant="caption" muted>Customisable</Text> : null}
      </View>
      <View style={styles.side}>
        {item.imageUrl ? <Image source={item.imageUrl} style={styles.image} contentFit="cover" /> : null}
        {!item.inStock ? (
          <Text variant="caption" color={t.danger}>Sold out</Text>
        ) : quantity > 0 ? (
          <View style={[styles.stepper, { borderColor: t.brand, backgroundColor: t.background }]}>
            <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove one ${item.name}`}><Text variant="heading" color={t.brand}>−</Text></Pressable>
            <Text variant="label" color={t.brand}>{quantity}</Text>
            <Pressable onPress={onAdd} hitSlop={8} accessibilityLabel={`Add one ${item.name}`}><Text variant="heading" color={t.brand}>+</Text></Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onAdd}
            disabled={unavailable}
            style={[styles.add, { borderColor: t.brand, backgroundColor: t.background, opacity: unavailable ? 0.4 : 1 }]}
            accessibilityLabel={`Add ${item.name}`}>
            <Text variant="label" color={t.brand}>ADD</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  side: { width: 110, alignItems: 'center', gap: -14 },
  image: { width: 110, height: 96, borderRadius: radius.md },
  add: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, marginTop: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginTop: spacing.sm },
});
