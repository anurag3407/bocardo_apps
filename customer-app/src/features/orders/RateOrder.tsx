import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { feedbackRate } from '@/core/api/generated/feedback/feedback';
import { Button, Card, Icon, Input, Row, spacing, Text, useTheme, type IconName } from '@/ui';

export function RateOrder({ orderId, hasRider, onDone }: { orderId: string; hasRider: boolean; onDone: () => void }) {
  const t = useTheme();
  const [food, setFood] = useState(0);
  const [rider, setRider] = useState(0);
  const [comment, setComment] = useState('');
  const rate = useMutation({
    mutationFn: () => feedbackRate(orderId, { restaurantRating: food, riderRating: hasRider && rider ? rider : undefined, comment: comment || undefined }),
    onSuccess: onDone,
  });

  return (
    <Card style={{ gap: spacing.lg, backgroundColor: t.skySoft }}>
      <View style={{ gap: 2 }}>
        <Text variant="heading">How was your order?</Text>
        <Text variant="caption" muted>Your rating helps restaurants and riders improve</Text>
      </View>
      <Stars label="Food" icon="restaurant" value={food} onChange={setFood} />
      {hasRider ? <Stars label="Delivery" icon="bicycle" value={rider} onChange={setRider} /> : null}
      <Input placeholder="Tell us more (optional)" accessibilityLabel="Rating comment (optional)" value={comment} onChangeText={setComment} multiline />
      {rate.error ? <Text variant="caption" color={t.dangerText}>{errorMessage(rate.error)}</Text> : null}
      <Button title="Submit rating" icon="send" disabled={!food} loading={rate.isPending} onPress={() => rate.mutate()} />
    </Card>
  );
}

function Stars({ label, icon, value, onChange }: { label: string; icon: IconName; value: number; onChange: (n: number) => void }) {
  const t = useTheme();
  return (
    <Row gap={spacing.md}>
      <Row gap={6} style={{ width: 92 }}>
        <Icon name={icon} size={16} color={t.textMuted} />
        <Text variant="subheading">{label}</Text>
      </Row>
      <Row gap={spacing.xs}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="button"
            accessibilityLabel={`${label} rating: ${n} star${n === 1 ? '' : 's'}`}
            accessibilityState={{ selected: n === value }}
            hitSlop={8}
            style={{ padding: 2 }}>
            <Icon name={n <= value ? 'star' : 'star-outline'} size={28} color={n <= value ? t.sun : t.textSubtle} />
          </Pressable>
        ))}
      </Row>
    </Row>
  );
}
