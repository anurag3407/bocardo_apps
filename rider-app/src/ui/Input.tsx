import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { radius, spacing, useTheme } from './theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, style, ...rest }: InputProps) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text variant="label" muted>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.textMuted}
        style={[styles.input, { borderColor: error ? t.danger : t.border, color: t.text, backgroundColor: t.surface }, style]}
        {...rest}
      />
      {error ? <Text variant="caption" color={t.danger}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16 },
});
