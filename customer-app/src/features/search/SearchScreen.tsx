import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCatalogSearch } from '@/core/api/generated/catalog/catalog';
import { RestaurantCard } from '@/features/home/RestaurantCard';
import { useDeliveryLocation } from '@/features/location/delivery-location-store';
import { formatPaise } from '@/lib/format';
import { Card, Chip, Divider, EmptyState, Icon, Input, Loading, Screen, spacing, Text, useTheme, VegMark } from '@/ui';

const SUGGESTIONS = ['Biryani', 'Pizza', 'Burger', 'Dosa', 'Chinese', 'Rolls', 'Thali', 'Desserts'];

export function SearchScreen() {
  const t = useTheme();
  const location = useDeliveryLocation((s) => s.location);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const search = useCatalogSearch({ q, lat: location?.lat ?? 0, lng: location?.lng ?? 0 }, { query: { enabled: q.length >= 2 && !!location } });
  const restaurants = search.data?.restaurants ?? [];
  const dishes = search.data?.dishes ?? [];

  return (
    <Screen>
      <Input
        icon="search"
        placeholder="Search for biryani, pizza, a restaurant…"
        value={text}
        onChangeText={setText}
        autoFocus
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {q.length < 2 ? (
        <View style={{ gap: spacing.md }}>
          <Text variant="overline" muted>Popular searches</Text>
          <View style={styles.wrap}>
            {SUGGESTIONS.map((s) => (
              <Chip key={s} label={s} icon="trending-up" active={false} onPress={() => setText(s)} />
            ))}
          </View>
        </View>
      ) : search.isLoading ? (
        <Loading />
      ) : !restaurants.length && !dishes.length ? (
        <EmptyState icon="search-outline" title="No results" message={`Nothing nearby matches "${q}". Try a different dish or cuisine.`} />
      ) : (
        <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {restaurants.length ? <Text variant="overline" muted>Restaurants</Text> : null}
          {restaurants.map((r) => <RestaurantCard key={r.id} compact restaurant={r} onPress={() => router.push(`/restaurant/${r.id}`)} />)}
          {dishes.length ? <Text variant="overline" muted style={{ marginTop: spacing.sm }}>Dishes</Text> : null}
          {dishes.length ? (
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {dishes.map((d, i) => (
                <View key={d.itemId}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable onPress={() => router.push(`/restaurant/${d.restaurant.id}`)} accessibilityRole="button" style={({ pressed }) => [styles.dish, pressed && { opacity: 0.6 }]}>
                    <VegMark veg={d.isVeg} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="subheading">{d.name}</Text>
                      <Text variant="caption" muted numberOfLines={1}>{d.restaurant.name} · {d.restaurant.etaMinutes} min</Text>
                    </View>
                    <Text variant="subheading">{formatPaise(d.pricePaise)}</Text>
                    <Icon name="chevron-forward" size={16} color={t.textSubtle} />
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dish: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
});
