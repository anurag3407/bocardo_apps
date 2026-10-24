import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { useTheme } from '@/ui';
import { startSessionSync, useSession } from '@/core/auth/session-store';
import { queryClient } from '@/core/query/query-client';
import { ForceUpdateGate } from '@/features/shell/ForceUpdateGate';
import { SignedInEffects } from '@/features/shell/SignedInEffects';

SplashScreen.preventAutoHideAsync();
startSessionSync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const t = useTheme();
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;
  const signedIn = status === 'signedIn';

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navigationTheme(scheme === 'dark' ? DarkTheme : DefaultTheme, t)}>
        <ForceUpdateGate>
          {signedIn ? <SignedInEffects /> : null}
          <Stack
            screenOptions={{
              headerBackButtonDisplayMode: 'minimal',
              headerShadowVisible: false,
              headerTintColor: t.text,
              headerTitleStyle: { fontWeight: '700', fontSize: 17 },
              headerStyle: { backgroundColor: t.background },
            }}>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="restaurant/[id]" options={{ title: '' }} />
              <Stack.Screen name="cart" options={{ title: 'Checkout' }} />
              <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
              <Stack.Screen name="addresses/index" options={{ title: 'Addresses' }} />
              <Stack.Screen name="addresses/new" options={{ title: 'New address' }} />
              <Stack.Screen name="support/new" options={{ title: 'Help', presentation: 'modal' }} />
            </Stack.Protected>
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            </Stack.Protected>
          </Stack>
        </ForceUpdateGate>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** Native headers, tab bar and screen backgrounds follow the Bocardo palette. */
function navigationTheme(base: typeof DefaultTheme, t: ReturnType<typeof useTheme>): typeof DefaultTheme {
  return { ...base, colors: { ...base.colors, primary: t.brand, background: t.background, card: t.background, text: t.text, border: t.border } };
}
