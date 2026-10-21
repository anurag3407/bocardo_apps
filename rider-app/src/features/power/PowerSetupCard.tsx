import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { isBatteryRestricted, oemAutostartLabel, openOemAutostartSettings, requestUnrestrictedBattery } from '@/core/power/battery-optimization';
import { Button, Card, spacing, Text, useTheme } from '@/ui';

/**
 * Shown on Android until the rider whitelists Bocardo. Without this, MIUI/ColorOS/Funtouch
 * kill location tracking minutes after the screen turns off and customers see a frozen rider.
 */
export function PowerSetupCard() {
  const t = useTheme();
  const [restricted, setRestricted] = useState(false);
  const oemLabel = oemAutostartLabel();

  useEffect(() => {
    const check = () => void isBatteryRestricted().then(setRestricted);
    check();
    // re-check when the rider comes back from the settings screen
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);

  if (!restricted && !oemLabel) return null;
  return (
    <Card style={{ gap: spacing.sm, borderColor: t.warning }}>
      <Text variant="heading">Keep Bocardo running</Text>
      <Text muted>Your phone may stop location sharing in the background. Allow these once so you keep receiving orders.</Text>
      {restricted ? <Button title="Allow background running" onPress={() => void requestUnrestrictedBattery()} /> : <Text variant="caption" color={t.success}>✓ Battery optimisation disabled</Text>}
      {oemLabel ? <Button title={`Enable ${oemLabel}`} kind="secondary" onPress={() => void openOemAutostartSettings()} /> : null}
    </Card>
  );
}
