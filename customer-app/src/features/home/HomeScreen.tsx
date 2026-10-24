import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCatalogNearby } from '@/core/api/generated/catalog/catalog';
import type { CatalogNearbySort } from '@/core/api/generated/model';
import { useEnsureDeliveryLocation } from '@/features/location/use-ensure-location';
import { CartBar } from '@/features/cart/CartBar';
import { Chip, elevation, EmptyState, ErrorState, Icon, IconButton, radius, Row, Skeleton, spacing, Text, useTheme, type IconName } from '@/ui';
import { RestaurantCard } from './RestaurantCard';

const SORTS: { key: CatalogNearbySort; label: string; icon: IconName }[] = [
  { key: 'delivery_time', label: 'Fastest', icon: 'flash' },
  { key: 'rating', label: 'Top rated', icon: 'star' },
  { key: 'cost_low', label: 'Budget', icon: 'wallet' },
];

const CUISINE_EMOJI: [RegExp, string][] = [
  [/biryani/i, '🍛'],
  [/pizza|italian/i, '🍕'],
  [/burger|american|fast/i, '🍔'],
  [/chinese|asian|momo/i, '🥡'],
  [/south/i, '🥞'],
  [/north|punjabi|mughlai/i, '🍲'],
  [/dessert|sweet|bakery|cake/i, '🍰'],
  [/ice ?cream/i, '🍨'],
  [/beverage|juice|shake|tea|coffee|cafe/i, '🥤'],
  [/roll|wrap|kebab|shawarma/i, '🌯'],
  [/thali/i, '🍱'],
  [/healthy|salad/i, '🥗'],
  [/street|chaat/i, '🥙'],
  [/seafood|fish/i, '🐟'],
  [/chicken|grill|bbq|tandoor/i, '🍗'],
];
const cuisineEmoji = (c: string) => CUISINE_EMOJI.find(([re]) => re.test(c))?.[1] ?? '🍽️';

export function HomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { location, gpsError } = useEnsureDeliveryLocation();
  const [cuisine, setCuisine] = useState<string | undefined>();
  const [vegOnly, setVegOnly] = useState(false);
  const [sort, setSort] = useState<CatalogNearbySort>('relevance');

  const nearby = useCatalogNearby(
    { lat: location?.lat ?? 0, lng: location?.lng ?? 0, cuisine, vegOnly: vegOnly || undefined, sort },
    { query: { enabled: !!location } },
  );
  const tints = [t.skySoft, t.limeSoft, t.sunSoft];

  const hero = (
    <View style={[styles.hero, { backgroundColor: t.sky, paddingTop: insets.top + spacing.sm }]}>
      <Row justify="space-between" gap={spacing.md}>
        <Pressable onPress={() => router.push('/addresses?pick=1')} accessibilityRole="button" accessibilityLabel="Change delivery location" style={{ flex: 1 }}>
          <Row gap={6}>
            <Icon name="location" size={22} color={t.ink} />
            <Text variant="heading" color={t.ink} numberOfLines={1} style={{ flexShrink: 1 }}>{location?.label ?? 'Choose a location'}</Text>
            <Icon name="chevron-down" size={18} color={t.ink} />
          </Row>
          <Text variant="caption" color={t.ink} style={{ opacity: 0.7, marginLeft: 28 }} numberOfLines={1}>Delivering to this location</Text>
        </Pressable>
        <IconButton name="person" label="Account" onPress={() => router.push('/account')} background={t.surfaceRaised} color={t.ink} />
      </Row>
      <Pressable onPress={() => router.push('/search')} style={[styles.search, { backgroundColor: t.surfaceRaised }, elevation(1, t)]} accessibilityRole="search">
        <Icon name="search" size={20} color={t.brand} />
        <Text muted style={{ flex: 1 }}>Search for dishes or restaurants</Text>
        <View style={[styles.searchDivider, { backgroundColor: t.border }]} />
        <Icon name="restaurant-outline" size={18} color={t.textMuted} />
      </Pressable>
    </View>
  );

  const filters = (
    <View style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      {nearby.data?.cuisines.length ? (
        <View style={{ gap: spacing.md }}>
          <Text variant="heading" style={styles.inset}>{"What's on your mind?"}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.inset, { gap: spacing.lg }]}>
            {nearby.data.cuisines.map((c, i) => {
              const active = cuisine === c;
              return (
                <Pressable key={c} onPress={() => setCuisine((cur) => (cur === c ? undefined : c))} accessibilityState={{ selected: active }} style={styles.cuisine}>
                  <View style={[styles.cuisineDisc, { backgroundColor: tints[i % tints.length], borderColor: active ? t.brand : 'transparent' }]}>
                    <Text style={{ fontSize: 30 }}>{cuisineEmoji(c)}</Text>
                  </View>
                  <Text variant="caption" color={active ? t.brandText : t.text} style={{ fontWeight: active ? '800' : '600' }} numberOfLines={1}>{c}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.inset, { gap: spacing.sm }]}>
        <Chip label="Pure veg" icon="leaf" active={vegOnly} onPress={() => setVegOnly((v) => !v)} />
        {SORTS.map((s) => (
          <Chip key={s.key} label={s.label} icon={s.icon} active={sort === s.key} onPress={() => setSort((cur) => (cur === s.key ? 'relevance' : s.key))} />
        ))}
      </ScrollView>
      {nearby.data?.restaurants.length ? (
        <Text variant="overline" muted style={styles.inset}>{nearby.data.restaurants.length} restaurants delivering to you</Text>
      ) : null}
    </View>
  );

  let body;
  if (!location) {
    body = gpsError ? (
      <EmptyState icon="location-outline" title="Where should we deliver?" message={gpsError} action={{ label: 'Add an address', onPress: () => router.push('/addresses/new') }} />
    ) : (
      <LoadingFeed label="Finding your location…" />
    );
  } else if (nearby.isLoading) body = <LoadingFeed />;
  else if (nearby.error) body = <ErrorState error={nearby.error} onRetry={() => nearby.refetch()} />;
  else if (!nearby.data?.serviceable) {
    body = (
      <EmptyState
        icon="map-outline"
        title="We're not here yet"
        message="Bocardo doesn't deliver to this location yet. Try another address."
        action={{ label: 'Change location', onPress: () => router.push('/addresses?pick=1') }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      {body ? (
        <View style={{ flex: 1 }}>
          {hero}
          {body}
        </View>
      ) : (
        <FlatList
          data={nearby.data?.restaurants ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {hero}
              {filters}
            </>
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
          ListHeaderComponentStyle={{ marginBottom: spacing.md }}
          ListEmptyComponent={
            <EmptyState
              icon="funnel-outline"
              title="No restaurants match"
              message="Try removing a filter."
              action={{ label: 'Clear filters', onPress: () => { setCuisine(undefined); setVegOnly(false); setSort('relevance'); } }}
            />
          }
          refreshing={nearby.isRefetching}
          onRefresh={() => nearby.refetch()}
          renderItem={({ item }) => (
            <View style={styles.inset}>
              <RestaurantCard restaurant={item} onPress={() => router.push(`/restaurant/${item.id}`)} />
            </View>
          )}
        />
      )}
      <CartBar />
    </View>
  );
}

function LoadingFeed({ label }: { label?: string }) {
  return (
    <View style={[styles.inset, { gap: spacing.xl, paddingTop: spacing.xl }]}>
      {label ? <Text muted center>{label}</Text> : null}
      {[0, 1].map((i) => (
        <View key={i} style={{ gap: spacing.sm }}>
          <Skeleton height={180} radius={radius.lg} />
          <Skeleton width="60%" height={18} />
          <Skeleton width="40%" height={14} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  inset: { paddingHorizontal: spacing.lg },
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg, borderBottomLeftRadius: radius.xl + 4, borderBottomRightRadius: radius.xl + 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 52 },
  searchDivider: { width: 1, height: 22 },
  cuisine: { alignItems: 'center', gap: spacing.sm, width: 76 },
  cuisineDisc: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
