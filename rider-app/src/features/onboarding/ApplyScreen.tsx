import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import type { RiderApplyDtoVehicleType } from '@/core/api/generated/model';
import { ridersApply } from '@/core/api/generated/rider/rider';
import { refreshClaims, signOut } from '@/core/auth/auth-actions';
import { Badge, Button, Card, Input, Logo, radius, Row, Screen, spacing, Text, useTheme } from '@/ui';

const VEHICLES: { key: RiderApplyDtoVehicleType; label: string; emoji: string }[] = [
  { key: 'motorcycle', label: 'Bike', emoji: '🏍️' },
  { key: 'scooter', label: 'Scooter', emoji: '🛵' },
  { key: 'ev', label: 'EV', emoji: '⚡' },
  { key: 'bicycle', label: 'Cycle', emoji: '🚲' },
];

export function ApplyScreen() {
  const t = useTheme();
  const [form, setForm] = useState({ fullName: '', vehicleNumber: '', licenseNumber: '' });
  const [vehicle, setVehicle] = useState<RiderApplyDtoVehicleType>('motorcycle');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (form.fullName.trim().length < 2) return Alert.alert('Enter your full name');
    setSaving(true);
    try {
      await ridersApply({
        fullName: form.fullName.trim(),
        vehicleType: vehicle,
        vehicleNumber: form.vehicleNumber.trim() || undefined,
        licenseNumber: form.licenseNumber.trim() || undefined,
      });
      await refreshClaims();
    } catch (e) {
      Alert.alert('Could not submit', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll tone="surface" footer={<Button title="Join as delivery partner" icon="arrow-forward" size="lg" loading={saving} onPress={submit} />}>
      <Card style={{ backgroundColor: t.sky, gap: spacing.md }}>
        <Logo size={44} wordmark tag="Rider" />
        <Text variant="title" color={t.ink}>Deliver with Bocardo</Text>
        <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
          <Badge label="Flexible hours" tone="lime" icon="time" />
          <Badge label="Weekly payouts" tone="sun" icon="wallet" />
        </Row>
        <Text variant="caption" color={t.ink} style={{ opacity: 0.75 }}>We verify your documents before your first shift.</Text>
      </Card>
      <Card style={{ gap: spacing.lg }}>
        <Input label="Full name (as on licence)" icon="person-outline" value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} />
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" muted>Vehicle</Text>
          <Row gap={spacing.sm}>
            {VEHICLES.map((v) => {
              const active = vehicle === v.key;
              return (
                <Pressable
                  key={v.key}
                  onPress={() => setVehicle(v.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={[styles.vehicle, { borderColor: active ? t.brand : t.border, backgroundColor: active ? t.brandSoft : t.surfaceRaised }]}>
                  <Text style={{ fontSize: 26 }}>{v.emoji}</Text>
                  <Text variant="label" color={active ? t.brandText : t.text}>{v.label}</Text>
                </Pressable>
              );
            })}
          </Row>
        </View>
        {vehicle !== 'bicycle' ? (
          <>
            <Input label="Vehicle number" icon="card-outline" placeholder="KA 01 AB 1234" autoCapitalize="characters" value={form.vehicleNumber} onChangeText={(v) => setForm((f) => ({ ...f, vehicleNumber: v }))} />
            <Input label="Driving licence number" icon="document-text-outline" autoCapitalize="characters" value={form.licenseNumber} onChangeText={(v) => setForm((f) => ({ ...f, licenseNumber: v }))} />
          </>
        ) : null}
      </Card>
      <Button title="Sign out" kind="ghost" icon="log-out-outline" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  vehicle: { flex: 1, alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing.md },
});
