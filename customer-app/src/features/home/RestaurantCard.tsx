import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import type { RestaurantCard as Restaurant } from '@/core/api/generated/model';
import { formatDistance, formatPaise } from '@/lib/format';
import { Badge, Card, Row, spacing, Text, useTheme } from '@/ui';

const CLOSED_LABEL: Record<string, string> = {
  OUTSIDE_HOURS: 'Closed now',
  BUSY: 'Not accepting orders right now',
  PAUSED: 'Temporarily closed',
  INACTIVE: 'Unavailable',
};

export function RestaurantCard({ restaurant: r, onPress }: { restaurant: Restaurant; onPress: () => void }) {
  const t = useTheme();
  return (
    <Card padded={false} onPress={onPress} style={!r.isOpen && { opacity: 0.6 }}>
      <View style={[styles.cover, { backgroundColor: t.brandSoft }]}>
        {r.coverImageUrl ? <Image source={r.coverImageUrl} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Text style={{ fontSize: 40 }}>🍲</Text>}
      </View>
      <View style={styles.body}>
        <Row justify="space-between">
          <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>{r.name}</Text>
          {r.ratingCount > 0 ? <Badge label={`★ ${r.ratingAvg.toFixed(1)}`} tone="success" /> : <Badge label="New" tone="brand" />}
        </Row>
        <Text muted numberOfLines={1}>{r.cuisines.join(', ')}</Text>
        <Row gap={spacing.md}>
          <Text variant="caption" muted>{r.etaMinutes} min</Text>
          <Text variant="caption" muted>· {formatDistance(r.distanceM)}</Text>
          {r.costForTwoPaise ? <Text variant="caption" muted>· {formatPaise(r.costForTwoPaise)} for two</Text> : null}
          {r.isVegOnly ? <Badge label="Pure veg" tone="success" /> : null}
        </Row>
        {!r.isOpen && r.closedReason ? <Text variant="caption" color={t.danger}>{CLOSED_LABEL[r.closedReason]}</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cover: { height: 150, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.md, gap: spacing.xs },
});
