import { bpsOf } from '../../common/utils/money';
import type { LedgerAccount, PaymentMethod } from '../../infra/database/db.types';

export interface SettlementInput {
  orderId: string;
  restaurantId: string;
  riderId: string;
  paymentMethod: PaymentMethod;
  totalPaise: number;
  itemTotalPaise: number;
  packagingFeePaise: number;
  discountPaise: number;
  taxPaise: number;
  tipPaise: number;
  commissionBps: number;
  /** Restaurant-funded coupons come out of the restaurant's share. */
  restaurantFundedDiscount: boolean;
  riderPayoutPaise: number;
}

export interface LedgerLine {
  accountType: LedgerAccount;
  accountId: string | null;
  amountPaise: number;
  entryType: string;
}

/**
 * Double-entry split of a delivered order. Positive = Bocardo owes that party;
 * the funding line (customer for online, rider-held cash for COD) is negative.
 * Lines always sum to zero.
 */
export function computeSettlement(s: SettlementInput): LedgerLine[] {
  const commission = bpsOf(s.itemTotalPaise, s.commissionBps);
  const restaurantShare =
    s.itemTotalPaise +
    s.packagingFeePaise -
    commission -
    (s.restaurantFundedDiscount ? s.discountPaise : 0);
  const riderShare = s.riderPayoutPaise + s.tipPaise;
  const platformShare = s.totalPaise - restaurantShare - riderShare - s.taxPaise;

  const funding: LedgerLine =
    s.paymentMethod === 'cod'
      ? {
          accountType: 'rider',
          accountId: s.riderId,
          amountPaise: -s.totalPaise,
          entryType: 'cod_cash_collected',
        }
      : {
          accountType: 'customer',
          accountId: null,
          amountPaise: -s.totalPaise,
          entryType: 'online_payment',
        };

  return [
    funding,
    {
      accountType: 'restaurant',
      accountId: s.restaurantId,
      amountPaise: restaurantShare,
      entryType: 'restaurant_earning',
    },
    {
      accountType: 'rider',
      accountId: s.riderId,
      amountPaise: riderShare,
      entryType: 'rider_earning',
    },
    { accountType: 'tax', accountId: null, amountPaise: s.taxPaise, entryType: 'gst_collected' },
    {
      accountType: 'platform',
      accountId: null,
      amountPaise: platformShare,
      entryType: 'platform_revenue',
    },
  ];
}
