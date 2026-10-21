import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Alert } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import {
  getPartnerListOrdersQueryKey,
  partnerAccept,
  partnerCancel,
  partnerExtendPrep,
  partnerReady,
  partnerReject,
} from '@/core/api/generated/partner/partner';
import type { RejectOrderDtoReason } from '@/core/api/generated/model';

type Action =
  | { kind: 'accept'; prepMinutes: number }
  | { kind: 'reject'; reason: RejectOrderDtoReason }
  | { kind: 'ready' }
  | { kind: 'extend'; extraMinutes: number }
  | { kind: 'cancel'; reason: string };

/** Every order action, with an idempotency key so a double-tap never double-acts. */
export function useOrderActions(restaurantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, action }: { orderId: string; action: Action }) => {
      const opts = { headers: { 'Idempotency-Key': Crypto.randomUUID() } };
      switch (action.kind) {
        case 'accept':
          return partnerAccept(restaurantId, orderId, { prepMinutes: action.prepMinutes }, opts);
        case 'reject':
          return partnerReject(restaurantId, orderId, { reason: action.reason }, opts);
        case 'ready':
          return partnerReady(restaurantId, orderId, opts);
        case 'extend':
          return partnerExtendPrep(restaurantId, orderId, { extraMinutes: action.extraMinutes }, opts);
        case 'cancel':
          return partnerCancel(restaurantId, orderId, { reason: action.reason }, opts);
      }
    },
    onError: (e) => Alert.alert('Action failed', errorMessage(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: getPartnerListOrdersQueryKey(restaurantId) }),
  });
}
