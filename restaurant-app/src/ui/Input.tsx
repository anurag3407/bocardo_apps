import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radius, spacing, useTheme } from './theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: IconName;
  /** Fixed text before the value, e.g. "+91" or "₹". */
  prefix?: string;
}

export function Input({ label, error, hint, icon, prefix, style, onFocus, onBlur, multiline, ...rest }: InputProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? t.danger : focused ? t.brand : t.border;
  return (
    <View style={{ gap: spacing.xs + 2 }}>
      {label ? <Text variant="label" muted>{label}</Text> : null}
      <View style={[styles.field, { borderColor, backgroundColor: focused ? t.surfaceRaised : t.surface }, multiline && styles.multiline]}>
        {icon ? <Icon name={icon} size={18} color={focused ? t.brandText : t.textSubtle} /> : null}
        {prefix ? <Text variant="subheading" style={{ marginRight: -spacing.xs }}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={t.textSubtle}
          selectionColor={t.brand}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: t.text }, multiline && { minHeight: 88, textAlignVertical: 'top' }, style]}
          {...rest}
        />
      </View>
      {error ? (
        <View style={styles.message}>
          <Icon name="alert-circle" size={14} color={t.danger} />
          <Text variant="caption" color={t.danger} style={{ flex: 1 }}>{error}</Text>
        </View>
      ) : hint ? (
        <Text variant="caption" subtle>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52 },
  multiline: { alignItems: 'flex-start', paddingTop: spacing.sm },
  input: { flex: 1, fontSize: 16, paddingVertical: spacing.md },
  message: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
