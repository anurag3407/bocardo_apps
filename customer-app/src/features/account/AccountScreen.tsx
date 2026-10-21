import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { getUsersMeQueryKey, useUsersMe, usersDeleteAccount, usersUpdate } from '@/core/api/generated/users/users';
import { useAppConfig } from '@/core/app-config/use-app-config';
import { signOut } from '@/core/auth/auth-actions';
import { Button, Card, Input, Screen, spacing, Text } from '@/ui';

export function AccountScreen() {
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

  return (
    <Screen scroll>
      <Text variant="title">Account</Text>
      <Card style={{ gap: spacing.sm }}>
        <Input label="Name" value={name ?? me.data?.fullName ?? ''} onChangeText={setName} placeholder="Your name" />
        {name !== null ? <Button title="Save" onPress={saveName} /> : null}
        <Text muted>{me.data?.phone ? `+${me.data.phone}` : ''}</Text>
      </Card>
      <Button title="Saved addresses" kind="ghost" onPress={() => router.push('/addresses')} />
      <Button title="Help & support" kind="ghost" onPress={() => router.push('/support/new')} />
      <Button title="Privacy Policy" kind="ghost" onPress={() => Linking.openURL('https://bocardo.app/privacy')} />
      <Button title="Terms of Service" kind="ghost" onPress={() => Linking.openURL('https://bocardo.app/terms')} />
      {config.data?.supportPhone ? <Text variant="caption" muted center>Support: {config.data.supportPhone}</Text> : null}
      <Button title="Sign out" kind="secondary" onPress={() => { qc.clear(); void signOut(); }} />
      <Button title="Delete account" kind="ghost" onPress={deleteAccount} />
    </Screen>
  );
}
