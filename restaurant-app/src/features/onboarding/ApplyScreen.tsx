import { useState } from 'react';
import { Alert, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { partnerApply } from '@/core/api/generated/partner/partner';
import { refreshClaims, signOut } from '@/core/auth/auth-actions';
import { currentLocation } from '@/core/location/current-location';
import { DeliveryMap } from '@/core/maps/delivery-map';
import { Button, Card, Icon, Input, Logo, radius, Row, Screen, spacing, Text, useTheme } from '@/ui';

/** Self-serve partner onboarding; the outlet goes live after Bocardo ops approves it. */
export function ApplyScreen() {
  const t = useTheme();
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
    <Screen scroll tone="surface" footer={<Button title="Submit for review" icon="send" size="lg" loading={saving} onPress={submit} />}>
      <Card style={{ backgroundColor: t.sky, gap: spacing.md }}>
        <Logo size={44} wordmark tag="Partner" />
        <Text variant="title" color={t.ink}>Partner with Bocardo</Text>
        <Text color={t.ink} style={{ opacity: 0.75 }}>Tell us about your restaurant. Our team verifies documents within 48 hours.</Text>
      </Card>

      <Card style={{ gap: spacing.lg }}>
        <Text variant="heading">Restaurant details</Text>
        <Input label="Restaurant name" icon="storefront-outline" {...field('name')} />
        <Input label="Cuisines" icon="restaurant-outline" placeholder="North Indian, Biryani" hint="Separate with commas" {...field('cuisines')} />
        <Input label="Outlet phone" icon="call-outline" keyboardType="phone-pad" {...field('phone')} />
      </Card>

      <Card style={{ gap: spacing.lg }}>
        <Text variant="heading">Location</Text>
        <Input label="Full address" {...field('addressLine')} multiline />
        {pin ? (
          <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
            <DeliveryMap center={pin} markers={[{ id: 'outlet', kind: 'restaurant', ...pin }]} height={180} onCenterChanged={setPin} />
          </View>
        ) : null}
        <Button title={pin ? 'Re-capture location' : 'Use current location'} icon="locate" kind="secondary" onPress={locate} />
        {pin ? (
          <Row gap={spacing.sm}>
            <Icon name="checkmark-circle" size={16} color={t.success} />
            <Text variant="caption" color={t.success}>Outlet location pinned</Text>
          </Row>
        ) : (
          <Text variant="caption" muted>Capture this while you are at the restaurant.</Text>
        )}
      </Card>

      <Card style={{ gap: spacing.lg }}>
        <Text variant="heading">Documents</Text>
        <Input label="FSSAI licence no." icon="document-text-outline" {...field('fssaiLicense')} />
        <Input label="GSTIN (optional)" icon="receipt-outline" autoCapitalize="characters" {...field('gstin')} />
      </Card>

      <Button title="Sign out" kind="ghost" icon="log-out-outline" onPress={() => void signOut()} />
    </Screen>
  );
}
