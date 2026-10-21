import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '@/ui';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <NativeTabs backgroundColor={t.background} tintColor={t.brand}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Orders</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bell.badge" md="notifications" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="menu">
        <NativeTabs.Trigger.Label>Menu</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet.rectangle" md="menu_book" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="earnings">
        <NativeTabs.Trigger.Label>Earnings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="indianrupeesign.circle" md="payments" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="outlet">
        <NativeTabs.Trigger.Label>Outlet</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="storefront" md="storefront" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
