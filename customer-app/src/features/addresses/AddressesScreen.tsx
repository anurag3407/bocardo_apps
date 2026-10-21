import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList } from 'react-native';
import { addressesRemove, getAddressesListQueryKey, useAddressesList } from '@/core/api/generated/addresses/addresses';
import { currentLocation } from '@/core/location/current-location';
import { useDeliveryLocation } from '@/features/location/delivery-location-store';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Row, Screen, spacing, Text } from '@/ui';

/** Address book. With `?pick=1` it doubles as the "deliver to" picker on Home. */
export function AddressesScreen() {
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const addresses = useAddressesList();
  const setLocation = useDeliveryLocation((s) => s.set);
  const qc = useQueryClient();

  if (addresses.isLoading) return <Loading />;
  if (addresses.error) return <ErrorState error={addresses.error} onRetry={() => addresses.refetch()} />;

  const useGps = async () => {
    try {
      const c = await currentLocation();
      setLocation({ addressId: null, label: 'Current location', ...c });
      router.back();
    } catch (e) {
      Alert.alert('Location unavailable', (e as Error).message);
    }
  };

  const remove = (id: string) =>
    Alert.alert('Delete address?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await addressesRemove(id);
          await qc.invalidateQueries({ queryKey: getAddressesListQueryKey() });
        },
      },
    ]);

  return (
    <Screen padded={false} edges={['bottom']}>
      <FlatList
        data={addresses.data ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        ListHeaderComponent={
          <Row>
            {pick ? <Button title="📍 Use current location" kind="secondary" onPress={useGps} style={{ flex: 1 }} /> : null}
            <Button title="+ Add address" kind="ghost" onPress={() => router.push('/addresses/new')} style={{ flex: 1 }} />
          </Row>
        }
        ListEmptyComponent={<EmptyState title="No saved addresses" message="Add one to order faster." />}
        renderItem={({ item: a }) => (
          <Card
            onPress={
              pick
                ? () => {
                    setLocation({ addressId: a.id, label: a.label === 'other' ? a.line1 : a.label[0].toUpperCase() + a.label.slice(1), lat: a.lat, lng: a.lng });
                    router.back();
                  }
                : undefined
            }
            style={{ gap: spacing.xs, opacity: a.serviceable ? 1 : 0.6 }}>
            <Row justify="space-between">
              <Text variant="label">{a.label.toUpperCase()}</Text>
              <Row>
                {a.isDefault ? <Badge label="Default" tone="brand" /> : null}
                {!a.serviceable ? <Badge label="Not serviceable" tone="danger" /> : null}
              </Row>
            </Row>
            <Text>{[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}</Text>
            <Text variant="caption" muted>{[a.city, a.pincode].filter(Boolean).join(' ')}</Text>
            {!pick ? <Button title="Delete" kind="ghost" onPress={() => remove(a.id)} /> : null}
          </Card>
        )}
      />
    </Screen>
  );
}
