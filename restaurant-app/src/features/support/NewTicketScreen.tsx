import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { feedbackCreateTicket } from '@/core/api/generated/feedback/feedback';
import type { CreateTicketDtoCategory } from '@/core/api/generated/model';
import { env } from '@/core/config/env';
import { Button, Input, radius, Screen, spacing, Text, useTheme } from '@/ui';

const CATEGORIES: { key: CreateTicketDtoCategory; label: string }[] = [
  { key: 'payment', label: 'Payouts & settlements' },
  { key: 'rider_behaviour', label: 'Delivery partner issue' },
  { key: 'restaurant_issue', label: 'Orders & menu' },
  { key: 'account', label: 'Account & documents' },
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
    <Screen scroll edges={['bottom']} footer={<Button title="Submit" size="lg" loading={sending} disabled={!category || description.trim().length < 10} onPress={submit} />}>
      <Text variant="heading">What went wrong?</Text>
      {CATEGORIES.map((c) => (
        <Pressable key={c.key} onPress={() => setCategory(c.key)} style={{ borderWidth: 1, borderRadius: radius.md, padding: spacing.md, borderColor: category === c.key ? t.brand : t.border }}>
          <Text variant="label" color={category === c.key ? t.brand : t.text}>{c.label}</Text>
        </Pressable>
      ))}
      <Input label="Tell us more (min. 10 characters)" value={description} onChangeText={setDescription} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} />
    </Screen>
  );
}
