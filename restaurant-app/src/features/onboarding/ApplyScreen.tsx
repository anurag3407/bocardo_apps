import { useState } from 'react';
import { Alert } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { partnerApply } from '@/core/api/generated/partner/partner';
import { refreshClaims, signOut } from '@/core/auth/auth-actions';
import { currentLocation } from '@/core/location/current-location';
import { DeliveryMap } from '@/core/maps/delivery-map';
import { Button, Input, Screen, spacing, Text } from '@/ui';

/** Self-serve partner onboarding; the outlet goes live after Bocardo ops approves it. */
export function ApplyScreen() {
  const [form, setForm] = useState({ name: '', cuisines: '', phone: '', addressLine: '', fssaiLicense: '', gstin: '' });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const field = (key: keyof typeof form) => ({ value: form[key], onChangeText: (v: string) => setForm((f) => ({ ...f, [key]: v })) });

  const locate = async () => {
    try {
      setPin(await currentLocation());
    } catch (e) {
      Alert.alert('Location needed', (e as Error).message);
    }
  };

  const submit = async () => {
    if (!pin) return Alert.alert('Pin your outlet', 'Use your current location while at the restaurant.');
    setSaving(true);
    try {
      await partnerApply({
        name: form.name.trim(),
        cuisines: form.cuisines.split(',').map((c) => c.trim()).filter(Boolean),
        phone: form.phone.trim(),
        addressLine: form.addressLine.trim(),
        lat: pin.lat,
        lng: pin.lng,
        fssaiLicense: form.fssaiLicense || undefined,
        gstin: form.gstin || undefined,
      });
      // new JWT carries the "restaurant" role → the router guard opens the partner app
      await refreshClaims();
    } catch (e) {
      Alert.alert('Could not submit', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll footer={<Button title="Submit for review" size="lg" loading={saving} onPress={submit} />}>
      <Text variant="title">Partner with Bocardo</Text>
      <Text muted>Tell us about your restaurant. Our team verifies documents within 48 hours.</Text>
      <Input label="Restaurant name" {...field('name')} />
      <Input label="Cuisines (comma separated)" placeholder="North Indian, Biryani" {...field('cuisines')} />
      <Input label="Outlet phone" keyboardType="phone-pad" {...field('phone')} />
      <Input label="Full address" {...field('addressLine')} multiline />
      {pin ? <DeliveryMap center={pin} markers={[{ id: 'outlet', kind: 'restaurant', ...pin }]} height={180} onCenterChanged={setPin} /> : null}
      <Button title={pin ? 'Re-capture location' : 'Use current location'} kind="secondary" onPress={locate} />
      <Input label="FSSAI licence no." {...field('fssaiLicense')} />
      <Input label="GSTIN (optional)" autoCapitalize="characters" {...field('gstin')} />
      <Button title="Sign out" kind="ghost" onPress={() => void signOut()} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}
