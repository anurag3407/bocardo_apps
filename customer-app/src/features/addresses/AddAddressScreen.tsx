import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { addressesCreate, getAddressesListQueryKey } from '@/core/api/generated/addresses/addresses';
import type { CreateAddressDtoLabel } from '@/core/api/generated/model';
import { currentLocation } from '@/core/location/current-location';
import { DeliveryMap } from '@/core/maps/delivery-map';
import { reverseGeocode } from '@/core/maps/geocoding';
import { useDeliveryLocation } from '@/features/location/delivery-location-store';
import { Button, Input, radius, Row, Screen, spacing, Text, useTheme } from '@/ui';

const LABELS: CreateAddressDtoLabel[] = ['home', 'work', 'other'];

/** Pin-on-map address entry: the pin (not the typed text) is what riders navigate to. */
export function AddAddressScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const setLocation = useDeliveryLocation((s) => s.set);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [form, setForm] = useState({ line1: '', line2: '', landmark: '', city: '', pincode: '', label: 'home' as CreateAddressDtoLabel });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    currentLocation().then(setPin).catch(() => setPin({ lat: 12.9716, lng: 77.5946 }));
  }, []);

  // prefill from the map pin; the user still confirms flat/house details
  useEffect(() => {
    if (!pin) return;
    const timer = setTimeout(async () => {
      const place = await reverseGeocode(pin.lat, pin.lng).catch(() => null);
      if (place) setForm((f) => ({ ...f, line2: place.label, city: place.city ?? f.city, pincode: place.pincode ?? f.pincode }));
    }, 600);
    return () => clearTimeout(timer);
  }, [pin]);

  const save = async () => {
    if (!pin) return;
    if (form.line1.trim().length < 3) return setError('Enter your flat / house number and building');
    setSaving(true);
    setError(null);
    try {
      const created = await addressesCreate({
        label: form.label,
        line1: form.line1.trim(),
        line2: form.line2 || null,
        landmark: form.landmark || null,
        city: form.city || null,
        pincode: /^\d{6}$/.test(form.pincode) ? form.pincode : null,
        lat: pin.lat,
        lng: pin.lng,
        isDefault: false,
      });
      await qc.invalidateQueries({ queryKey: getAddressesListQueryKey() });
      if (created.serviceable) setLocation({ addressId: created.id, label: form.label === 'other' ? created.line1 : form.label[0].toUpperCase() + form.label.slice(1), lat: created.lat, lng: created.lng });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form) => ({ value: form[key], onChangeText: (v: string) => setForm((f) => ({ ...f, [key]: v })) });

  return (
    <Screen scroll edges={['bottom']} footer={<Button title="Save address" size="lg" loading={saving} disabled={!pin} onPress={save} />}>
      {pin ? (
        <View>
          <DeliveryMap center={pin} zoom={16} markers={[]} height={260} onCenterChanged={setPin} showUserLocation />
          {/* fixed pin in the center; the map moves underneath it */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 260 / 2 - 28, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ fontSize: 28 }}>📍</Text>
          </View>
          <Text variant="caption" muted center>Move the map to place the pin at your door</Text>
        </View>
      ) : null}
      <Input label="Flat / house no., building *" {...field('line1')} />
      <Input label="Area / street" {...field('line2')} />
      <Input label="Landmark" {...field('landmark')} />
      <Row>
        <View style={{ flex: 1 }}><Input label="City" {...field('city')} /></View>
        <View style={{ flex: 1 }}><Input label="Pincode" keyboardType="number-pad" maxLength={6} {...field('pincode')} /></View>
      </Row>
      <Row>
        {LABELS.map((l) => (
          <Pressable key={l} onPress={() => setForm((f) => ({ ...f, label: l }))} style={{ borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderColor: form.label === l ? t.brand : t.border }}>
            <Text variant="label" color={form.label === l ? t.brand : t.text}>{l[0].toUpperCase() + l.slice(1)}</Text>
          </Pressable>
        ))}
      </Row>
      {error ? <Text color={t.danger}>{error}</Text> : null}
    </Screen>
  );
}
