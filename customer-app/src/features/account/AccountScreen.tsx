import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { getUsersMeQueryKey, useUsersMe, usersDeleteAccount, usersUpdate } from '@/core/api/generated/users/users';
import { useAppConfig } from '@/core/app-config/use-app-config';
import { signOut } from '@/core/auth/auth-actions';
import { Button, Card, Divider, IconButton, Input, ListItem, Logo, radius, Row, Screen, spacing, Text, useTheme } from '@/ui';

export function AccountScreen() {
  const t = useTheme();
  const me = useUsersMe();
  const config = useAppConfig();
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);

  const saveName = async () => {
    if (!name?.trim()) return;
    try {
      await usersUpdate({ fullName: name.trim() });
      await qc.invalidateQueries({ queryKey: getUsersMeQueryKey() });
      setName(null);
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    }
  };

  const deleteAccount = () =>
    Alert.alert('Delete account?', 'Your personal data will be erased. Order records are kept for legal reasons.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await usersDeleteAccount();
            await signOut();
          } catch (e) {
            Alert.alert('Could not delete', errorMessage(e));
          }
        },
      },
    ]);

  const displayName = me.data?.fullName || 'Hungry human';
  const initial = displayName.trim()[0]?.toUpperCase() ?? 'B';

  return (
    <Screen scroll tone="surface" title="Account">
      <Card style={[styles.profile, { backgroundColor: t.sky }]}>
        <View style={[styles.avatar, { backgroundColor: t.surfaceRaised }]}>
          <Text variant="title" color={t.ink}>{initial}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {name === null ? (
            <>
              <Text variant="heading" color={t.ink} numberOfLines={1}>{displayName}</Text>
              <Text color={t.ink} style={{ opacity: 0.75 }}>{me.data?.phone ? `+${me.data.phone}` : ''}</Text>
            </>
          ) : (
            <Input value={name} onChangeText={setName} placeholder="Your name" autoFocus onSubmitEditing={saveName} returnKeyType="done" />
          )}
        </View>
        {name === null ? (
          <IconButton name="pencil" label="Edit name" onPress={() => setName(me.data?.fullName ?? '')} background={t.surfaceRaised} color={t.ink} />
        ) : null}
      </Card>
      {name !== null ? (
        <Row>
          <Button title="Cancel" kind="ghost" onPress={() => setName(null)} style={{ flex: 1 }} />
          <Button title="Save name" onPress={saveName} style={{ flex: 1 }} />
        </Row>
      ) : null}

      <Card padded={false} style={styles.group}>
        <ListItem icon="location-outline" title="Saved addresses" subtitle="Home, work and other places" onPress={() => router.push('/addresses')} />
        <Divider inset={48} />
        <ListItem icon="receipt-outline" title="Your orders" subtitle="Track, rate and get help" onPress={() => router.navigate('/orders')} />
        <Divider inset={48} />
        <ListItem icon="chatbubble-ellipses-outline" title="Help & support" subtitle={config.data?.supportPhone ? `Call ${config.data.supportPhone}` : 'Raise a request with our team'} onPress={() => router.push('/support/new')} />
      </Card>

      <Card padded={false} style={styles.group}>
        <ListItem icon="shield-checkmark-outline" title="Privacy Policy" onPress={() => Linking.openURL('https://bocardo.app/privacy')} />
        <Divider inset={48} />
        <ListItem icon="document-text-outline" title="Terms of Service" onPress={() => Linking.openURL('https://bocardo.app/terms')} />
      </Card>

      <Card padded={false} style={styles.group}>
        <ListItem icon="log-out-outline" title="Sign out" chevron={false} onPress={() => { qc.clear(); void signOut(); }} />
        <Divider inset={48} />
        <ListItem icon="trash-outline" title="Delete account" destructive chevron={false} onPress={deleteAccount} />
      </Card>

      <View style={{ alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, opacity: 0.8 }}>
        <Logo size={28} />
        <Text variant="caption" subtle>Bocardo v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  group: { paddingHorizontal: spacing.lg, borderRadius: radius.lg },
});
