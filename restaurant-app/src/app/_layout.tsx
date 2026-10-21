import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { startSessionSync, useSession } from '@/core/auth/session-store';
import { queryClient } from '@/core/query/query-client';
import { ForceUpdateGate } from '@/features/shell/ForceUpdateGate';
import { SignedInEffects } from '@/features/shell/SignedInEffects';

SplashScreen.preventAutoHideAsync();
startSessionSync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const { status, roles } = useSession();

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;
  const signedIn = status === 'signedIn';
  const isPartner = roles.includes('restaurant');

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ForceUpdateGate>
          {signedIn && isPartner ? <SignedInEffects /> : null}
          <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Protected guard={signedIn && isPartner}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
              <Stack.Screen name="menu/item" options={{ title: 'Item', presentation: 'modal' }} />
              <Stack.Screen name="history" options={{ title: 'Order history' }} />
              <Stack.Screen name="support/new" options={{ title: 'Support', presentation: 'modal' }} />
            </Stack.Protected>
            <Stack.Protected guard={signedIn && !isPartner}>
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
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
