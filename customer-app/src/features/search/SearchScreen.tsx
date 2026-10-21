import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useCatalogSearch } from '@/core/api/generated/catalog/catalog';
import { RestaurantCard } from '@/features/home/RestaurantCard';
import { useDeliveryLocation } from '@/features/location/delivery-location-store';
import { formatPaise } from '@/lib/format';
import { Card, EmptyState, Input, Loading, Row, Screen, spacing, Text, VegMark } from '@/ui';

export function SearchScreen() {
  const location = useDeliveryLocation((s) => s.location);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const search = useCatalogSearch({ q, lat: location?.lat ?? 0, lng: location?.lng ?? 0 }, { query: { enabled: q.length >= 2 && !!location } });

  return (
    <Screen>
      <Input placeholder="Search for biryani, pizza, a restaurant…" value={text} onChangeText={setText} autoFocus returnKeyType="search" />
      {q.length < 2 ? (
        <EmptyState title="What are you craving?" />
      ) : search.isLoading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          {search.data?.restaurants.map((r) => <RestaurantCard key={r.id} restaurant={r} onPress={() => router.push(`/restaurant/${r.id}`)} />)}
          {search.data?.dishes.length ? <Text variant="heading">Dishes</Text> : null}
          {search.data?.dishes.map((d) => (
            <Card key={d.itemId} onPress={() => router.push(`/restaurant/${d.restaurant.id}`)}>
              <Row justify="space-between">
                <Row><VegMark veg={d.isVeg} /><Text>{d.name}</Text></Row>
                <Text variant="label">{formatPaise(d.pricePaise)}</Text>
              </Row>
              <Text variant="caption" muted>{d.restaurant.name} · {d.restaurant.etaMinutes} min</Text>
            </Card>
          ))}
          {!search.data?.restaurants.length && !search.data?.dishes.length ? <EmptyState title="No results" message={`Nothing nearby matches "${q}"`} /> : null}
        </ScrollView>
      )}
    </Screen>
  );
}
