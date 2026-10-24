import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { sendOtp, verifyOtp } from '@/core/auth/auth-actions';
import { Button, Icon, IconButton, radius, Screen, spacing, Text, useTheme } from '@/ui';

const RESEND_AFTER_S = 30;
const LENGTH = 6;

export function VerifyScreen() {
  const t = useTheme();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER_S);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const verify = async (value = code) => {
    if (value.length !== LENGTH) return;
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

  const pretty = phone?.startsWith('+91') ? `+91 ${phone.slice(3, 8)} ${phone.slice(8)}` : phone;

  return (
    <Screen>
      <IconButton name="arrow-back" label="Back" onPress={() => router.back()} />
      <View style={{ gap: spacing.sm }}>
        <Text variant="title">Enter verification code</Text>
        <Text muted>
          We sent a {LENGTH}-digit code to <Text variant="subheading">{pretty}</Text>
        </Text>
      </View>

      {/* one hidden input drives the six boxes so SMS autofill and paste keep working */}
      <Pressable onPress={() => input.current?.focus()} style={styles.boxes} accessibilityLabel="Verification code">
        {Array.from({ length: LENGTH }, (_, i) => {
          const filled = i < code.length;
          const current = i === code.length && !loading;
          return (
            <View
              key={i}
              style={[
                styles.box,
                { borderColor: error ? t.danger : current ? t.brand : filled ? t.text : t.border, backgroundColor: filled ? t.surfaceRaised : t.surface },
              ]}>
              <Text variant="title">{code[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, LENGTH);
          setCode(digits);
          if (error) setError(null);
          if (digits.length === LENGTH) void verify(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={LENGTH}
        style={styles.hidden}
      />
      {error ? (
        <View style={styles.error}>
          <Icon name="alert-circle" size={16} color={t.danger} />
          <Text variant="label" color={t.danger}>{error}</Text>
        </View>
      ) : null}

      <Button title="Verify" size="lg" loading={loading} disabled={code.length !== LENGTH} onPress={() => verify()} />
      <View style={styles.resend}>
        <Text muted>{"Didn't get it?"}</Text>
        {wait > 0 ? (
          <Text variant="label" subtle>Resend in 0:{String(wait).padStart(2, '0')}</Text>
        ) : (
          <Pressable onPress={resend} hitSlop={8} accessibilityRole="button">
            <Text variant="label" color={t.brandText}>Resend code</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  box: { flex: 1, aspectRatio: 0.85, maxWidth: 56, borderWidth: 1.5, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  resend: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
});
