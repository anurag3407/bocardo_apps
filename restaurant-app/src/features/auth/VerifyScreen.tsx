import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { sendOtp, verifyOtp } from '@/core/auth/auth-actions';
import { Button, Input, Screen, spacing, Text } from '@/ui';

const RESEND_AFTER_S = 30;

export function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER_S);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      // the session store reacts to the new session and the router guard navigates
      await verifyOtp(phone, value);
    } catch (e) {
      setError((e as Error).message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setWait(RESEND_AFTER_S);
    try {
      await sendOtp(phone);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <Text variant="title">Verify your number</Text>
        <Text muted>Enter the 6-digit code sent to {phone}</Text>
      </View>
      <Input
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
          if (digits.length === 6) void verify(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        placeholder="••••••"
        style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
        error={error}
      />
      <Button title="Verify" size="lg" loading={loading} disabled={code.length !== 6} onPress={() => verify()} />
      <Button title={wait > 0 ? `Resend code in ${wait}s` : 'Resend code'} kind="ghost" disabled={wait > 0} onPress={resend} />
    </Screen>
  );
}
