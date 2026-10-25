import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import type { RestaurantCard as Restaurant } from '@/core/api/generated/model';
import { formatDistance, formatPaise } from '@/lib/format';
import { Badge, Card, Icon, radius, RatingBadge, Row, spacing, Text, useTheme } from '@/ui';

const CLOSED_LABEL: Record<string, string> = {
  OUTSIDE_HOURS: 'Closed now',
  BUSY: 'Not accepting orders right now',
  PAUSED: 'Temporarily closed',
  INACTIVE: 'Unavailable',
};

/** Full-bleed photo card for the home feed. `compact` is the thumbnail row used in search. */
export function RestaurantCard({ restaurant: r, onPress, compact }: { restaurant: Restaurant; onPress: () => void; compact?: boolean }) {
  const t = useTheme();
  const closed = !r.isOpen && r.closedReason ? CLOSED_LABEL[r.closedReason] : null;

  if (compact) {
    return (
      <Card padded={false} onPress={onPress} style={[styles.compact, !r.isOpen && { opacity: 0.6 }]}>
        <Cover uri={r.coverImageUrl} style={styles.thumb} />
        <View style={{ flex: 1, gap: 3, justifyContent: 'center' }}>
          <Text variant="subheading" numberOfLines={1}>{r.name}</Text>
          <Row gap={6}>
            {r.ratingCount > 0 ? <RatingBadge value={r.ratingAvg} size="sm" /> : <Badge label="New" tone="brand" />}
            <Text variant="caption" muted>{r.etaMinutes} min · {formatDistance(r.distanceM)}</Text>
          </Row>
          <Text variant="caption" muted numberOfLines={1}>{r.cuisines.join(', ')}</Text>
          {closed ? <Text variant="caption" color={t.dangerText}>{closed}</Text> : null}
        </View>
      </Card>
    );
  }

  return (
    <Card padded={false} onPress={onPress} accessibilityLabel={`${r.name}, ${r.cuisines.join(', ')}`}>
      <View>
        <Cover uri={r.coverImageUrl} style={styles.cover} />
        {r.isVegOnly ? <View style={styles.topLeft}><Badge label="Pure veg" tone="lime" icon="leaf" /></View> : null}
        <View style={[styles.eta, { backgroundColor: t.surfaceRaised }]}>
          <Icon name="time" size={13} color={t.successText} />
          <Text variant="caption" style={{ fontWeight: '800' }}>{r.etaMinutes} min</Text>
        </View>
        {closed ? (
          <View style={[StyleSheet.absoluteFill, styles.closed, { backgroundColor: t.overlay }]}>
            <Text variant="subheading" color={t.textInverse}>{closed}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Row justify="space-between" gap={spacing.md}>
          <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>{r.name}</Text>
          {r.ratingCount > 0 ? <RatingBadge value={r.ratingAvg} /> : <Badge label="New" tone="brand" />}
        </Row>
        <Row justify="space-between" gap={spacing.md}>
          <Text muted numberOfLines={1} style={{ flex: 1 }}>{r.cuisines.join(', ')}</Text>
          {r.costForTwoPaise ? <Text variant="caption" muted>{formatPaise(r.costForTwoPaise)} for two</Text> : null}
        </Row>
        <View style={[styles.meta, { borderTopColor: t.border }]}>
          <Icon name="navigate-circle" size={15} color={t.brandText} />
          <Text variant="caption" muted>{formatDistance(r.distanceM)} away</Text>
        </View>
      </View>
    </Card>
  );
}

function Cover({ uri, style }: { uri: string | null; style: object }) {
  const t = useTheme();
  return (
    <View style={[style, { backgroundColor: t.skySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}>
      {uri ? <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Icon name="restaurant" size={36} color={t.sky} />}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { height: 180, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  topLeft: { position: 'absolute', top: spacing.md, left: spacing.md },
  eta: { position: 'absolute', bottom: spacing.md, left: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  closed: { alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  body: { padding: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.sm, paddingTop: spacing.sm },
  compact: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm },
  thumb: { width: 84, height: 84, borderRadius: radius.md },
});
