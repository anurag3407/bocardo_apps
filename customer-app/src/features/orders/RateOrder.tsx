import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { feedbackRate } from '@/core/api/generated/feedback/feedback';
import { Button, Card, Input, Row, spacing, Text, useTheme } from '@/ui';

export function RateOrder({ orderId, hasRider, onDone }: { orderId: string; hasRider: boolean; onDone: () => void }) {
  const [food, setFood] = useState(0);
  const [rider, setRider] = useState(0);
  const [comment, setComment] = useState('');
  const rate = useMutation({
    mutationFn: () => feedbackRate(orderId, { restaurantRating: food, riderRating: hasRider && rider ? rider : undefined, comment: comment || undefined }),
    onSuccess: onDone,
  });

  return (
    <Card style={{ gap: spacing.md }}>
      <Text variant="heading">How was your order?</Text>
      <Stars label="Food" value={food} onChange={setFood} />
      {hasRider ? <Stars label="Delivery" value={rider} onChange={setRider} /> : null}
      <Input placeholder="Tell us more (optional)" value={comment} onChangeText={setComment} multiline />
      {rate.error ? <Text variant="caption">{errorMessage(rate.error)}</Text> : null}
      <Button title="Submit rating" disabled={!food} loading={rate.isPending} onPress={() => rate.mutate()} />
    </Card>
  );
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const t = useTheme();
  return (
    <Row gap={spacing.md}>
      <Text style={{ width: 70 }}>{label}</Text>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} accessibilityLabel={`${n} star`} hitSlop={6}>
          <Text style={{ fontSize: 26 }} color={n <= value ? t.warning : t.border}>★</Text>
        </Pressable>
      ))}
    </Row>
  );
}
