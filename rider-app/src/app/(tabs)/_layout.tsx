import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '@/ui';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <NativeTabs backgroundColor={t.background} tintColor={t.brand}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Duty</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="scooter" md="two_wheeler" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="earnings">
        <NativeTabs.Trigger.Label>Earnings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="indianrupeesign.circle" md="payments" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Label>Trips</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
