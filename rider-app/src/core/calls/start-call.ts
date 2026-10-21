import { Alert, Linking } from 'react-native';
import { errorMessage } from '../api/api-error';
import { callsStart } from '../api/generated/calls/calls';
import type { StartCallDtoTarget } from '../api/generated/model';

/**
 * Masked calling: the platform rings this phone and bridges to the other party through a
 * virtual number, so nobody sees anyone else's personal number.
 */
export async function startCall(orderId: string, target: StartCallDtoTarget) {
  try {
    const res = await callsStart(orderId, { target });
    if (res.mode === 'direct' && res.dial) await Linking.openURL(`tel:${res.dial}`);
    else Alert.alert('Connecting your call', res.message);
  } catch (e) {
    Alert.alert('Could not call', errorMessage(e));
  }
}
