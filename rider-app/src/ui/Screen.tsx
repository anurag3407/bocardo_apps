import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { spacing, useTheme } from './theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
}

/** Standard screen frame: safe areas, background, optional scroll + pull-to-refresh, sticky footer. */
export function Screen({ children, scroll, padded = true, edges = ['top'], footer, refreshing, onRefresh, contentStyle }: ScreenProps) {
  const t = useTheme();
  const inner = [padded && styles.padded, contentStyle];
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: t.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, { paddingBottom: spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, inner]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { borderTopColor: t.border, backgroundColor: t.background }]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { padding: spacing.lg, gap: spacing.lg },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
