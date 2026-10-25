import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { normalizePhone, sendOtp } from '@/core/auth/auth-actions';
import { Button, Input, Logo, radius, Row, spacing, Text, useTheme } from '@/ui';

/** Sky hero with the brand mark, white sheet with the phone field (Zomato-style entry). */
export function LoginScreen({ headline = 'Food you love,\ndelivered fast', tag }: { headline?: string; tag?: string }) {
  const t = useTheme();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // the hero flexes to fill the screen, so without this the sheet stays under the keyboard
  useEffect(() => {
    const toSheet = () => scroll.current?.scrollToEnd({ animated: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    // rAF catches the resize; the delayed call lands after the keyboard animation settles
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(toSheet);
      clearTimeout(timer);
      timer = setTimeout(toSheet, 300);
    });
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

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
    <View style={{ flex: 1, backgroundColor: t.sky }}>
      {/* the hero is always light, so system icons need dark glyphs for contrast */}
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView ref={scroll} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <SafeAreaView edges={['top']} style={styles.hero}>
            <Logo size={56} wordmark tag={tag} />
            <View style={{ gap: spacing.md }}>
              <Text variant="display" color={t.ink} style={{ fontSize: 36, lineHeight: 42 }}>{headline}</Text>
              <Row gap={spacing.sm}>
                <View style={[styles.dot, { backgroundColor: t.lime }]} />
                <View style={[styles.dot, { backgroundColor: t.sun }]} />
                <View style={[styles.dot, { backgroundColor: t.ink }]} />
              </Row>
            </View>
          </SafeAreaView>

          <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: t.background }]}>
            <View style={styles.divider}>
              <View style={[styles.rule, { backgroundColor: t.border }]} />
              <Text variant="label" muted>Log in or sign up</Text>
              <View style={[styles.rule, { backgroundColor: t.border }]} />
            </View>
            <Input
              prefix="+91"
              placeholder="Enter mobile number"
              accessibilityLabel="Mobile number, +91"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              maxLength={14}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                if (error) setError(null);
              }}
              error={error}
              onSubmitEditing={submit}
              style={{ fontSize: 17, fontWeight: '600', letterSpacing: 0.5 }}
            />
            <Button title="Continue" size="lg" loading={loading} disabled={phone.replace(/\D/g, '').length < 10} onPress={submit} />
            <Text variant="caption" subtle center>{"By continuing, you agree to Bocardo's Terms of Service and Privacy Policy."}</Text>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, minHeight: 300, justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  dot: { width: 10, height: 10, borderRadius: 5 },
  sheet: { borderTopLeftRadius: radius.xl + 4, borderTopRightRadius: radius.xl + 4, padding: spacing.xl, gap: spacing.lg },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
