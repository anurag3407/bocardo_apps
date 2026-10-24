import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { useRidersMe } from '@/core/api/generated/rider/rider';
import { signOut } from '@/core/auth/auth-actions';
import { stopTracking } from '@/core/location/background-tracking';
import { formatPaise } from '@/lib/format';
import { Badge, Card, Divider, Icon, ListItem, radius, Row, Screen, spacing, Text, useTheme, type IconName } from '@/ui';

export function ProfileScreen() {
  const t = useTheme();
  const me = useRidersMe();
  const r = me.data;

  const logout = () => {
    if (r?.isOnline) return Alert.alert('Go offline first', 'Switch off duty before signing out.');
    void stopTracking().finally(() => signOut());
  };

  const initial = r?.fullName?.trim()[0]?.toUpperCase() ?? 'R';

  return (
    <Screen scroll tone="surface" title="Profile">
      {r ? (
        <>
          <Card style={{ backgroundColor: t.sky, gap: spacing.lg }}>
            <Row gap={spacing.md}>
              <View style={[styles.avatar, { backgroundColor: t.surfaceRaised }]}>
                <Text variant="title" color={t.ink}>{initial}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="heading" color={t.ink} numberOfLines={1}>{r.fullName ?? 'Delivery partner'}</Text>
                <Badge label={r.kycStatus === 'approved' ? 'Verified' : r.kycStatus} tone={r.kycStatus === 'approved' ? 'success' : 'warning'} icon={r.kycStatus === 'approved' ? 'shield-checkmark' : 'hourglass'} solid />
              </View>
            </Row>
            <Row gap={spacing.sm}>
              <Metric icon="star" label="Rating" value={r.ratingAvg.toFixed(1)} />
              <Metric icon="checkmark-circle" label="Acceptance" value={`${Math.round(r.acceptanceRate * 100)}%`} />
              <Metric icon="cash" label="Cash in hand" value={formatPaise(r.cashInHandPaise)} />
            </Row>
          </Card>
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            <ListItem
              icon={r.vehicleType === 'bicycle' ? 'bicycle-outline' : r.vehicleType === 'ev' ? 'flash-outline' : 'speedometer-outline'}
              title="Vehicle"
              subtitle={[r.vehicleType[0].toUpperCase() + r.vehicleType.slice(1), r.vehicleNumber].filter(Boolean).join(' · ')}
            />
          </Card>
        </>
      ) : null}
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListItem icon="chatbubble-ellipses-outline" title="Rider support" subtitle="Payouts, documents, trip issues" onPress={() => router.push('/support/new')} />
        <Divider inset={48} />
        <ListItem icon="log-out-outline" title="Sign out" destructive chevron={false} onPress={logout} />
      </Card>
    </Screen>
  );
}

function Metric({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={[styles.metric, { backgroundColor: t.surfaceRaised }]}>
      <Icon name={icon} size={16} color={t.brandText} />
      <Text variant="subheading" numberOfLines={1}>{value}</Text>
      <Text variant="caption" muted numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  metric: { flex: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
});
