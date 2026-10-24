import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Text } from './Text';
import { elevation, spacing, useTheme } from './theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
  /** Large in-page title for tab roots (screens without a native header). */
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  /** `surface` = light grey canvas for pages made of floating cards. */
  tone?: 'default' | 'surface';
}

/** Standard screen frame: safe areas, background, optional large title, scroll + pull-to-refresh, sticky footer. */
export function Screen({ children, scroll, padded = true, edges = ['top'], footer, refreshing, onRefresh, contentStyle, title, subtitle, headerRight, tone = 'default' }: ScreenProps) {
  const t = useTheme();
  const bg = tone === 'surface' ? t.surface : t.background;
  const inner = [padded && styles.padded, contentStyle];
  const header = title ? <ScreenTitle title={title} subtitle={subtitle} right={headerRight} /> : null;
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: bg }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, { paddingBottom: spacing.xxxl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.brand} colors={[t.brand]} /> : undefined}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, inner]}>
          {header}
          {children}
        </View>
      )}
      {footer ? <View style={[styles.footer, { backgroundColor: t.surfaceRaised }, elevation(3, t)]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.title}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title">{title}</Text>
        {subtitle ? <Text muted>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { padding: spacing.lg, gap: spacing.lg },
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
});
