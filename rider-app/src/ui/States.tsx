import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { spacing, useTheme } from './theme';

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={t.brand} />
      {label ? <Text muted>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.center}>
      <Text variant="heading" center>{title}</Text>
      {message ? <Text muted center>{message}</Text> : null}
      {action ? <Button title={action.label} onPress={action.onPress} kind="secondary" /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return <EmptyState title="Couldn't load this" message={message} action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined} />;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function Row({ children, gap = spacing.sm, justify = 'flex-start' as const }: { children: React.ReactNode; gap?: number; justify?: 'flex-start' | 'space-between' | 'center' | 'flex-end' }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap, justifyContent: justify }}>{children}</View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
});
