import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useActiveAppIcon } from '@/core/app-icon/use-app-icon';
import { type AppIconId } from '@/core/app-icon/app-icon';
import { Badge, Card, Divider, Icon, radius, Row, Screen, spacing, Text, useTheme } from '@/ui';

export default function AppIconScreen() {
  const t = useTheme();
  const { activeIcon, changeIcon, availableIcons } = useActiveAppIcon();
  const [switching, setSwitching] = useState<AppIconId | null>(null);

  const handleSelect = async (id: AppIconId) => {
    if (activeIcon === id) return;

    setSwitching(id);
    try {
      const ok = await changeIcon(id);
      if (!ok) {
        Alert.alert('Notice', 'Could not update app icon in this environment.');
      } else if (Platform.OS === 'android') {
        Alert.alert('Icon Updated', 'Your app icon will update when you return to your home screen.');
      }
    } catch {
      Alert.alert('Error', 'Failed to change app icon.');
    } finally {
      setSwitching(null);
    }
  };

  return (
    <Screen scroll tone="surface" title="App Icon">
      <View style={{ gap: spacing.xs, marginBottom: spacing.md }}>
        <Text variant="heading">Choose your icon</Text>
        <Text muted variant="body">
          Select your favorite look for Bocardo on your home screen. Seasonal festival icons update automatically when enabled.
        </Text>
      </View>

      <Card padded={false} style={styles.group}>
        {availableIcons.map((item, index) => {
          const isSelected = activeIcon === item.id;
          const isBusy = switching === item.id;

          return (
            <React.Fragment key={item.id}>
              {index > 0 ? <Divider inset={72} /> : null}
              <Pressable
                onPress={() => handleSelect(item.id)}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [
                  styles.itemRow,
                  { backgroundColor: pressed ? t.surface : 'transparent' },
                ]}
              >
                <View style={[styles.iconWrapper, { borderColor: isSelected ? t.brand : t.border }]}>
                  <Image source={item.preview} style={styles.iconImage} resizeMode="cover" />
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={spacing.xs}>
                    <Text variant="label" style={{ fontWeight: isSelected ? '700' : '600' }}>
                      {item.name}
                    </Text>
                    {item.badge ? (
                      <Badge
                        label={item.badge}
                        tone={item.id === 'diwali' ? 'warning' : item.id === 'gold' ? 'sun' : 'brand'}
                      />
                    ) : null}
                  </Row>
                  <Text variant="caption" muted numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                </View>

                <View style={styles.checkWrapper}>
                  {isBusy ? (
                    <ActivityIndicator size="small" color={t.brand} />
                  ) : isSelected ? (
                    <View style={[styles.selectedCircle, { backgroundColor: t.brand }]}>
                      <Icon name="checkmark" size={14} color={t.textInverse} />
                    </View>
                  ) : (
                    <View style={[styles.unselectedCircle, { borderColor: t.border }]} />
                  )}
                </View>
              </Pressable>
            </React.Fragment>
          );
        })}
      </Card>

      <Card style={[styles.infoCard, { backgroundColor: t.surfaceRaised }]}>
        <Row gap={spacing.sm} style={{ alignItems: 'flex-start' }}>
          <Icon name="information-circle-outline" size={20} color={t.brandText} />
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text variant="label" color={t.text}>
              {Platform.OS === 'ios' ? 'iOS Note' : 'Android Note'}
            </Text>
            <Text variant="caption" muted>
              {Platform.OS === 'ios'
                ? 'Apple iOS requires a brief system prompt when confirming an alternate icon change.'
                : 'Android applies the alternate launcher icon when the app enters the background.'}
            </Text>
          </View>
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, overflow: 'hidden' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  iconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  checkWrapper: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unselectedCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  infoCard: {
    marginTop: spacing.md,
    borderRadius: radius.md,
  },
});
