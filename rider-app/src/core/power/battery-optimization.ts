import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

/**
 * Budget Android skins (Xiaomi/MIUI, Vivo/Funtouch, Oppo/ColorOS…) kill background apps
 * aggressively. Riders need two things whitelisted: Android battery optimisation, and the
 * OEM's own "autostart"/background-launch list.
 */
const packageName = () => Constants.expoConfig?.android?.package ?? 'app.bocardo.rider';

export async function isBatteryRestricted(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await Battery.isBatteryOptimizationEnabledAsync();
  } catch {
    return false;
  }
}

/** System dialog "Let app always run in background?" (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS). */
export async function requestUnrestrictedBattery() {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, { data: `package:${packageName()}` });
  } catch {
    await openAppSettings();
  }
}

interface OemScreen {
  label: string;
  packageName: string;
  className: string;
}

const OEM_AUTOSTART: { match: RegExp; screens: OemScreen[] }[] = [
  {
    match: /xiaomi|redmi|poco/,
    screens: [{ label: 'Autostart', packageName: 'com.miui.securitycenter', className: 'com.miui.permcenter.autostart.AutoStartManagementActivity' }],
  },
  {
    match: /oppo|realme/,
    screens: [
      { label: 'Startup manager', packageName: 'com.coloros.safecenter', className: 'com.coloros.safecenter.permission.startup.StartupAppListActivity' },
      { label: 'Startup manager', packageName: 'com.oppo.safe', className: 'com.oppo.safe.permission.startup.StartupAppListActivity' },
    ],
  },
  {
    match: /vivo|iqoo/,
    screens: [
      { label: 'Background start', packageName: 'com.vivo.permissionmanager', className: 'com.vivo.permissionmanager.activity.BgStartUpManagerActivity' },
      { label: 'Background start', packageName: 'com.iqoo.secure', className: 'com.iqoo.secure.ui.phoneoptimize.BgStartUpManager' },
    ],
  },
  {
    match: /oneplus/,
    screens: [{ label: 'Auto-launch', packageName: 'com.oneplus.security', className: 'com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity' }],
  },
  {
    match: /huawei|honor/,
    screens: [{ label: 'App launch', packageName: 'com.huawei.systemmanager', className: 'com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity' }],
  },
];

/** The OEM-specific screen to show, if this phone's maker is known to kill background apps. */
export function oemAutostartLabel(): string | null {
  if (Platform.OS !== 'android') return null;
  const maker = `${Device.manufacturer ?? ''} ${Device.brand ?? ''}`.toLowerCase();
  return OEM_AUTOSTART.find((o) => o.match.test(maker))?.screens[0].label ?? null;
}

export async function openOemAutostartSettings() {
  const maker = `${Device.manufacturer ?? ''} ${Device.brand ?? ''}`.toLowerCase();
  const entry = OEM_AUTOSTART.find((o) => o.match.test(maker));
  for (const screen of entry?.screens ?? []) {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', { packageName: screen.packageName, className: screen.className });
      return;
    } catch {
      // activity names differ between OS versions — try the next one
    }
  }
  await openAppSettings();
}

async function openAppSettings() {
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, { data: `package:${packageName()}` });
}
