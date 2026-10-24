import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { feedbackCreateTicket } from '@/core/api/generated/feedback/feedback';
import type { CreateTicketDtoCategory } from '@/core/api/generated/model';
import { env } from '@/core/config/env';
import { Button, Icon, Input, radius, Screen, spacing, Text, useTheme, type IconName } from '@/ui';

const CATEGORIES: { key: CreateTicketDtoCategory; label: string }[] = [
  { key: 'missing_item', label: 'Missing item' },
  { key: 'wrong_item', label: 'Wrong item' },
  { key: 'quality', label: 'Food quality' },
  { key: 'late_delivery', label: 'Late delivery' },
  { key: 'payment', label: 'Payment / refund' },
  { key: 'rider_behaviour', label: 'Delivery partner' },
  { key: 'restaurant_issue', label: 'Restaurant' },
  { key: 'account', label: 'Account' },
  { key: 'other', label: 'Something else' },
];

export function NewTicketScreen() {
  const t = useTheme();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const [category, setCategory] = useState<CreateTicketDtoCategory | null>(null);
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!category) return;
    setSending(true);
    try {
      await feedbackCreateTicket({
        app: env.app,
        orderId,
        category,
        subject: CATEGORIES.find((c) => c.key === category)!.label,
        description: description.trim(),
        attachments: [],
      });
      Alert.alert('Request received', 'Our support team will get back to you shortly.');
      router.back();
    } catch (e) {
      Alert.alert('Could not submit', errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={<Button title="Submit request" icon="send" size="lg" loading={sending} disabled={!category || description.trim().length < 10} onPress={submit} />}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="title">How can we help?</Text>
        <Text muted>{orderId ? 'Tell us what went wrong with this order.' : 'Pick a topic and our team will get back to you shortly.'}</Text>
      </View>
      <View style={styles.grid}>
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setCategory(c.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={[styles.tile, { borderColor: active ? t.brand : t.border, backgroundColor: active ? t.brandSoft : t.surfaceRaised }]}>
              <Icon name={CATEGORY_ICONS[c.key] ?? 'help-circle-outline'} size={22} color={active ? t.brandText : t.textMuted} />
              <Text variant="label" color={active ? t.brandText : t.text} numberOfLines={2}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Input
        label="Tell us more"
        hint={description.trim().length < 10 ? `${10 - description.trim().length} more characters needed` : undefined}
        placeholder="Describe the issue in a few words"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 120 }}
      />
    </Screen>
  );
}

const CATEGORY_ICONS: Partial<Record<CreateTicketDtoCategory, IconName>> = {
  missing_item: 'remove-circle-outline',
  wrong_item: 'swap-horizontal-outline',
  quality: 'thumbs-down-outline',
  late_delivery: 'time-outline',
  payment: 'card-outline',
  rider_behaviour: 'bicycle-outline',
  restaurant_issue: 'restaurant-outline',
  account: 'person-circle-outline',
  other: 'chatbubble-ellipses-outline',
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '48.5%', flexGrow: 1, borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, minHeight: 84 },
});
