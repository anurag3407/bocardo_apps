import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, View } from 'react-native';
import { addressesRemove, getAddressesListQueryKey, useAddressesList } from '@/core/api/generated/addresses/addresses';
import { currentLocation } from '@/core/location/current-location';
import { useDeliveryLocation } from '@/features/location/delivery-location-store';
import { Badge, Card, Divider, EmptyState, ErrorState, IconBadge, IconButton, ListItem, Loading, Row, Screen, spacing, Text, useTheme } from '@/ui';

/** Address book. With `?pick=1` it doubles as the "deliver to" picker on Home. */
export function AddressesScreen() {
  const t = useTheme();
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

  const labelOf = (a: { label: string; line1: string }) => (a.label === 'other' ? a.line1 : a.label[0].toUpperCase() + a.label.slice(1));

  return (
    <Screen padded={false} tone="surface" edges={['bottom']}>
      <FlatList
        data={addresses.data ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg }}>
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {pick ? (
                <>
                  <ListItem icon="locate" title="Use current location" subtitle="Using GPS" onPress={useGps} />
                  <Divider inset={48} />
                </>
              ) : null}
              <ListItem icon="add" title="Add new address" onPress={() => router.push('/addresses/new')} />
            </Card>
            {addresses.data?.length ? <Text variant="overline" muted>Saved addresses</Text> : null}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="home-outline" title="No saved addresses" message="Add one to order faster." />}
        renderItem={({ item: a }) => (
          <Card
            onPress={
              pick
                ? () => {
                    setLocation({ addressId: a.id, label: labelOf(a), lat: a.lat, lng: a.lng });
                    router.back();
                  }
                : undefined
            }
            style={{ opacity: a.serviceable ? 1 : 0.6 }}>
            <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
              <IconBadge name={a.label === 'home' ? 'home' : a.label === 'work' ? 'briefcase' : 'location'} size={40} />
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Row gap={spacing.sm}>
                  <Text variant="heading">{labelOf(a)}</Text>
                  {a.isDefault ? <Badge label="Default" tone="brand" /> : null}
                  {!a.serviceable ? <Badge label="Not serviceable" tone="danger" /> : null}
                </Row>
                <Text muted>{[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}</Text>
                <Text variant="caption" subtle>{[a.city, a.pincode].filter(Boolean).join(' ')}</Text>
              </View>
              {!pick ? <IconButton name="trash-outline" label="Delete address" onPress={() => remove(a.id)} size={36} color={t.danger} background={t.dangerSoft} /> : null}
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
