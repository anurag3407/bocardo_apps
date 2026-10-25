import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { isBatteryRestricted, oemAutostartLabel, openOemAutostartSettings, requestUnrestrictedBattery } from '@/core/power/battery-optimization';
import { Button, Card, Icon, IconBadge, Row, spacing, Text, useTheme } from '@/ui';

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
    <Card style={{ gap: spacing.md, backgroundColor: t.warningSoft }}>
      <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
        <IconBadge name="battery-charging" size={40} shape="square" background={t.surfaceRaised} color={t.warningText} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">Keep Bocardo running</Text>
          <Text variant="caption" muted>Your phone may stop location sharing in the background. Allow these once so you keep receiving orders.</Text>
        </View>
      </Row>
      {restricted ? (
        <Button title="Allow background running" icon="checkmark-circle" onPress={() => void requestUnrestrictedBattery()} />
      ) : (
        <Row gap={spacing.xs}>
          <Icon name="checkmark-circle" size={16} color={t.successText} />
          <Text variant="caption" color={t.successText}>Battery optimisation disabled</Text>
        </Row>
      )}
      {oemLabel ? <Button title={`Enable ${oemLabel}`} icon="settings-outline" kind="outline" onPress={() => void openOemAutostartSettings()} /> : null}
    </Card>
  );
}
