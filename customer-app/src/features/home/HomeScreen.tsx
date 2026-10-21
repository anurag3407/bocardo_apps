import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCatalogNearby } from '@/core/api/generated/catalog/catalog';
import type { CatalogNearbySort } from '@/core/api/generated/model';
import { useEnsureDeliveryLocation } from '@/features/location/use-ensure-location';
import { CartBar } from '@/features/cart/CartBar';
import { EmptyState, ErrorState, Loading, radius, Row, spacing, Text, useTheme } from '@/ui';
import { RestaurantCard } from './RestaurantCard';

const SORTS: { key: CatalogNearbySort; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'delivery_time', label: 'Fastest' },
  { key: 'rating', label: 'Rating' },
  { key: 'cost_low', label: 'Cost: low' },
];

export function HomeScreen() {
  const t = useTheme();
  const { location, gpsError } = useEnsureDeliveryLocation();
  const [cuisine, setCuisine] = useState<string | undefined>();
  const [vegOnly, setVegOnly] = useState(false);
  const [sort, setSort] = useState<CatalogNearbySort>('relevance');

  const nearby = useCatalogNearby(
    { lat: location?.lat ?? 0, lng: location?.lng ?? 0, cuisine, vegOnly: vegOnly || undefined, sort },
    { query: { enabled: !!location } },
  );

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <Pressable onPress={() => router.push('/addresses?pick=1')} accessibilityRole="button" accessibilityLabel="Change delivery location">
        <Text variant="caption" muted>DELIVER TO</Text>
        <Text variant="heading" numberOfLines={1}>📍 {location?.label ?? 'Choose a location'} ▾</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/search')} style={[styles.search, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text muted>🔍  Search restaurants or dishes</Text>
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        <Chip label="Pure veg" active={vegOnly} onPress={() => setVegOnly((v) => !v)} />
        {SORTS.map((s) => <Chip key={s.key} label={s.label} active={sort === s.key} onPress={() => setSort(s.key)} />)}
      </ScrollView>
      {nearby.data?.cuisines.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {nearby.data.cuisines.map((c) => <Chip key={c} label={c} active={cuisine === c} onPress={() => setCuisine((cur) => (cur === c ? undefined : c))} />)}
        </ScrollView>
      ) : null}
    </View>
  );

  let body;
  if (!location) body = gpsError ? <EmptyState title="Where should we deliver?" message={gpsError} action={{ label: 'Add an address', onPress: () => router.push('/addresses/new') }} /> : <Loading label="Finding your location…" />;
  else if (nearby.isLoading) body = <Loading />;
  else if (nearby.error) body = <ErrorState error={nearby.error} onRetry={() => nearby.refetch()} />;
  else if (!nearby.data?.serviceable) body = <EmptyState title="We're not here yet" message="Bocardo doesn't deliver to this location yet. Try another address." action={{ label: 'Change location', onPress: () => router.push('/addresses?pick=1') }} />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      {body ? (
        <View style={{ flex: 1, padding: spacing.lg }}>{header}{body}</View>
      ) : (
        <FlatList
          data={nearby.data?.restaurants ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 }}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState title="No restaurants match" message="Try removing a filter." />}
          refreshing={nearby.isRefetching}
          onRefresh={() => nearby.refetch()}
          renderItem={({ item }) => <RestaurantCard restaurant={item} onPress={() => router.push(`/restaurant/${item.id}`)} />}
        />
      )}
      <CartBar />
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: active }}
      style={[styles.chip, { borderColor: active ? t.brand : t.border, backgroundColor: active ? t.brandSoft : t.background }]}>
      <Row gap={4}>
        <Text variant="label" color={active ? t.brand : t.text}>{label}</Text>
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
