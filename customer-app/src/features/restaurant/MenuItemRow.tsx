import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MenuItem } from '@/core/api/generated/model';
import { formatPaise } from '@/lib/format';
import { Badge, elevation, Icon, radius, Row, spacing, Text, useTheme, VegMark } from '@/ui';

export function MenuItemRow({ item, quantity, disabled, onAdd, onRemove }: { item: MenuItem; quantity: number; disabled: boolean; onAdd: () => void; onRemove: () => void }) {
  const t = useTheme();
  const fromPrice = item.variants.length ? Math.min(...item.variants.map((v) => v.pricePaise)) : item.pricePaise;
  const unavailable = !item.inStock || disabled;
  const customisable = item.variants.length > 0 || item.addonGroups.length > 0;

  return (
    <View style={[styles.row, { borderBottomColor: t.border }, !item.inStock && { opacity: 0.55 }]}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Row gap={6}>
          <VegMark veg={item.isVeg} />
          {item.isBestseller ? <Badge label="Bestseller" tone="sun" icon="star" /> : null}
        </Row>
        <Text variant="heading">{item.name}</Text>
        <Text variant="subheading">{item.variants.length ? `from ${formatPaise(fromPrice)}` : formatPaise(fromPrice)}</Text>
        {item.description ? <Text variant="caption" muted numberOfLines={2} style={{ marginTop: 2 }}>{item.description}</Text> : null}
      </View>
      <View style={styles.side}>
        {item.imageUrl ? <Image source={item.imageUrl} style={styles.image} contentFit="cover" transition={150} /> : <View style={{ height: spacing.lg }} />}
        <View style={[styles.actionWrap, item.imageUrl ? { marginTop: -20 } : null]}>
          {!item.inStock ? (
            <View style={[styles.action, { backgroundColor: t.surface }]}>
              <Text variant="label" muted>Sold out</Text>
            </View>
          ) : quantity > 0 ? (
            <View style={[styles.action, styles.stepper, { backgroundColor: t.brand }, elevation(2, t)]}>
              <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove one ${item.name}`}>
                <Icon name="remove" size={18} color={t.textInverse} />
              </Pressable>
              <Text variant="subheading" color={t.textInverse} style={{ fontWeight: '800' }}>{quantity}</Text>
              <Pressable onPress={onAdd} hitSlop={10} accessibilityLabel={`Add one ${item.name}`}>
                <Icon name="add" size={18} color={t.textInverse} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onAdd}
              disabled={unavailable}
              style={({ pressed }) => [styles.action, { backgroundColor: t.surfaceRaised, borderColor: t.border, borderWidth: 1, opacity: unavailable ? 0.5 : pressed ? 0.8 : 1 }, elevation(2, t)]}
              accessibilityLabel={`Add ${item.name}`}>
              <Text variant="subheading" color={t.brandText} style={{ fontWeight: '800', letterSpacing: 0.5 }}>ADD</Text>
              <Icon name="add" size={14} color={t.brandText} />
            </Pressable>
          )}
        </View>
        {customisable && item.inStock ? <Text variant="caption" subtle style={{ fontSize: 11 }}>Customisable</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, paddingVertical: spacing.xl, borderBottomWidth: StyleSheet.hairlineWidth },
  side: { width: 128, alignItems: 'center', gap: spacing.xs },
  image: { width: 128, height: 120, borderRadius: radius.lg },
  actionWrap: { alignItems: 'center' },
  action: { width: 104, height: 38, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  stepper: { justifyContent: 'space-between', paddingHorizontal: spacing.md },
});
