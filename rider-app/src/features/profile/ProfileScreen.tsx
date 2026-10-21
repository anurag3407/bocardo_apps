import { router } from 'expo-router';
import { Alert } from 'react-native';
import { useRidersMe } from '@/core/api/generated/rider/rider';
import { signOut } from '@/core/auth/auth-actions';
import { stopTracking } from '@/core/location/background-tracking';
import { formatPaise } from '@/lib/format';
import { Badge, Button, Card, Row, Screen, spacing, Text } from '@/ui';

export function ProfileScreen() {
  const me = useRidersMe();
  const r = me.data;

  const logout = () => {
    if (r?.isOnline) return Alert.alert('Go offline first', 'Switch off duty before signing out.');
    void stopTracking().finally(() => signOut());
  };

  return (
    <Screen scroll>
      <Text variant="title">{r?.fullName ?? 'Profile'}</Text>
      {r ? (
        <Card style={{ gap: spacing.sm }}>
          <Row>
            <Badge label={r.kycStatus} tone={r.kycStatus === 'approved' ? 'success' : 'warning'} />
            <Badge label={`★ ${r.ratingAvg.toFixed(1)}`} />
            <Badge label={`Acceptance ${Math.round(r.acceptanceRate * 100)}%`} />
          </Row>
          <Text muted>{r.vehicleType} {r.vehicleNumber ? `· ${r.vehicleNumber}` : ''}</Text>
          <Text muted>Cash in hand: {formatPaise(r.cashInHandPaise)}</Text>
        </Card>
      ) : null}
      <Button title="Rider support" kind="ghost" onPress={() => router.push('/support/new')} />
      <Button title="Sign out" kind="secondary" onPress={logout} />
    </Screen>
  );
}
