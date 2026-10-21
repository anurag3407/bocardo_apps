import { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import type { RiderApplyDtoVehicleType } from '@/core/api/generated/model';
import { ridersApply } from '@/core/api/generated/rider/rider';
import { refreshClaims, signOut } from '@/core/auth/auth-actions';
import { Button, Input, radius, Row, Screen, spacing, Text, useTheme } from '@/ui';

const VEHICLES: { key: RiderApplyDtoVehicleType; label: string }[] = [
  { key: 'motorcycle', label: '🏍️ Bike' },
  { key: 'scooter', label: '🛵 Scooter' },
  { key: 'ev', label: '⚡ EV' },
  { key: 'bicycle', label: '🚲 Cycle' },
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
    <Screen scroll footer={<Button title="Join as delivery partner" size="lg" loading={saving} onPress={submit} />}>
      <Text variant="title">Deliver with Bocardo</Text>
      <Text muted>Flexible hours, weekly payouts. We verify your documents before your first shift.</Text>
      <Input label="Full name (as on licence)" value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} />
      <Text variant="label">Vehicle</Text>
      <Row>
        {VEHICLES.map((v) => (
          <Pressable key={v.key} onPress={() => setVehicle(v.key)} style={{ borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, borderColor: vehicle === v.key ? t.brand : t.border }}>
            <Text variant="label">{v.label}</Text>
          </Pressable>
        ))}
      </Row>
      {vehicle !== 'bicycle' ? (
        <>
          <Input label="Vehicle number" autoCapitalize="characters" value={form.vehicleNumber} onChangeText={(v) => setForm((f) => ({ ...f, vehicleNumber: v }))} />
          <Input label="Driving licence number" autoCapitalize="characters" value={form.licenseNumber} onChangeText={(v) => setForm((f) => ({ ...f, licenseNumber: v }))} />
        </>
      ) : null}
      <Button title="Sign out" kind="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
