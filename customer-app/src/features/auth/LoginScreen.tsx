import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { normalizePhone, sendOtp } from '@/core/auth/auth-actions';
import { Button, Input, Screen, spacing, Text } from '@/ui';

export function LoginScreen({ title = 'Bocardo', subtitle = 'Food you love, delivered fast' }: { title?: string; subtitle?: string }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) return setError('Enter a valid 10-digit mobile number');
    setError(null);
    setLoading(true);
    try {
      await sendOtp(normalized);
      router.push({ pathname: '/verify', params: { phone: normalized } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', gap: spacing.xl }}>
        <View style={{ gap: spacing.sm }}>
          <Text variant="title">{title}</Text>
          <Text muted>{subtitle}</Text>
        </View>
        <Input
          label="Mobile number"
          placeholder="98765 43210"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={14}
          value={phone}
          onChangeText={setPhone}
          error={error}
          onSubmitEditing={submit}
        />
        <Button title="Send OTP" size="lg" loading={loading} onPress={submit} />
        <Text variant="caption" muted center>{"By continuing you agree to Bocardo's Terms and Privacy Policy."}</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}
