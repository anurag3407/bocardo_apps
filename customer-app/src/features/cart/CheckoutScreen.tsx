import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { isApiError, errorMessage } from '@/core/api/api-error';
import { useAddressesList } from '@/core/api/generated/addresses/addresses';
import type { PriceBreakdown } from '@/core/api/generated/model';
import { ordersPlace } from '@/core/api/generated/orders/orders';
import { paymentsVerify } from '@/core/api/generated/payments/payments';
import { useUsersMe } from '@/core/api/generated/users/users';
import { CheckoutCancelled, openCheckout } from '@/core/payments/checkout';
import { queryClient } from '@/core/query/query-client';
import { useDeliveryLocation } from '@/features/location/delivery-location-store';
import { formatPaise } from '@/lib/format';
import { Button, Card, Chip, Divider, EmptyState, Icon, IconBadge, Input, radius, Row, Screen, spacing, Text, useTheme, VegMark, type IconName } from '@/ui';
import { useCart } from './cart-store';
import { useQuote } from './use-quote';

const TIPS = [0, 2000, 3000, 5000];

export function CheckoutScreen() {
  const t = useTheme();
  const cart = useCart();
  const me = useUsersMe();
  const addresses = useAddressesList();
  const delivery = useDeliveryLocation((s) => s.location);
  const [chosenAddressId, setAddressId] = useState<string | null>(delivery?.addressId ?? null);
  const [couponInput, setCouponInput] = useState(cart.couponCode ?? '');
  const [customerNote, setCustomerNote] = useState('');
  const [chosenMethod, setMethod] = useState<'online' | 'cod'>('online');
  const [placing, setPlacing] = useState(false);
  // when browsing by GPS, fall back to the saved default (serviceable) address
  const addressId =
    chosenAddressId ?? (addresses.data?.find((a) => a.isDefault && a.serviceable) ?? addresses.data?.find((a) => a.serviceable))?.id ?? null;
  const quote = useQuote(addressId);
  const method = chosenMethod === 'cod' && quote.data && !quote.data.codAvailable ? 'online' : chosenMethod;
  const idempotency = useRef<{ quoteId: string; key: string } | null>(null);

  if (!cart.lines.length) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon="bag-handle-outline" title="Your cart is empty" message="Add something delicious to get started." action={{ label: 'Browse restaurants', onPress: () => router.replace('/') }} />
      </Screen>
    );
  }

  const issues = isApiError(quote.error, 'CART_INVALID') ? ((quote.error.details as { issues: { menuItemId: string; message: string }[] }).issues ?? []) : [];

  const place = async () => {
    const q = quote.data;
    if (!q) return;
    // same key for retries of the same quote; a new quote means a new logical order
    if (idempotency.current?.quoteId !== q.quoteId) idempotency.current = { quoteId: q.quoteId, key: Crypto.randomUUID() };
    setPlacing(true);
    try {
      const result = await ordersPlace(
        { quoteId: q.quoteId, paymentMethod: method, customerNote: customerNote.trim() || undefined },
        { headers: { 'Idempotency-Key': idempotency.current.key } },
      );
      cart.clear();
      void queryClient.invalidateQueries({ queryKey: ['/orders'] });

      if (result.payment) {
        try {
          const paid = await openCheckout(result.payment, { name: me.data?.fullName, phone: me.data?.phone, description: `Order #${result.order.shortCode}` });
          await paymentsVerify({ orderId: result.order.id, ...paid });
        } catch (e) {
          if (!(e instanceof CheckoutCancelled)) Alert.alert('Payment not completed', errorMessage(e));
        }
      }
      router.replace(`/order/${result.order.id}`);
    } catch (e) {
      if (isApiError(e, 'QUOTE_EXPIRED') || isApiError(e, 'QUOTE_ALREADY_USED')) {
        await quote.refetch();
        Alert.alert('Prices updated', 'Please review your order again.');
      } else {
        Alert.alert("Couldn't place order", errorMessage(e));
      }
    } finally {
      setPlacing(false);
    }
  };

  const savedServiceable = addresses.data?.filter((a) => a.serviceable) ?? [];
  const total = quote.data?.pricing.totalPaise;

  return (
    <Screen
      scroll
      tone="surface"
      edges={['bottom']}
      contentStyle={{ gap: spacing.md }}
      footer={
        <Row gap={spacing.lg}>
          <View style={{ gap: 1 }}>
            <Text variant="title" style={{ fontSize: 20 }}>{total !== undefined ? formatPaise(total) : '—'}</Text>
            <Text variant="caption" muted>{method === 'cod' ? 'Pay on delivery' : 'Total incl. taxes'}</Text>
          </View>
          <Button
            size="lg"
            title={method === 'cod' ? 'Place order' : 'Proceed to pay'}
            icon={method === 'cod' ? 'checkmark-circle' : 'lock-closed'}
            disabled={!quote.data || quote.isFetching || !!quote.error}
            loading={placing}
            onPress={place}
            style={{ flex: 1 }}
          />
        </Row>
      }>
      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.md}>
          <IconBadge name="restaurant" size={40} shape="square" />
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1}>{cart.restaurantName}</Text>
            {quote.data ? <Text variant="caption" muted>Delivery in ~{quote.data.etaMinutes} min</Text> : null}
          </View>
        </Row>
        <Divider />
        {cart.lines.map((l) => (
          <Row key={l.key} gap={spacing.md} style={{ alignItems: 'flex-start' }}>
            <View style={{ paddingTop: 3 }}><VegMark veg={l.isVeg} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="subheading">{l.name}</Text>
              {l.variantName || l.addonNames.length ? <Text variant="caption" muted>{[l.variantName, ...l.addonNames].filter(Boolean).join(', ')}</Text> : null}
              <Text variant="label" muted>{formatPaise(l.unitPricePaise)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
              <Stepper value={l.quantity} onChange={(n) => cart.setQuantity(l.key, n)} />
              <Text variant="label">{formatPaise(l.unitPricePaise * l.quantity)}</Text>
            </View>
          </Row>
        ))}
        <Divider />
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Row gap={spacing.xs}>
            <Icon name="add-circle" size={18} color={t.brandText} />
            <Text variant="label" color={t.brandText}>Add more items</Text>
          </Row>
        </Pressable>
      </Card>

      {issues.length ? (
        <Card variant="outlined" style={{ backgroundColor: t.dangerSoft, borderColor: t.danger, gap: spacing.sm }}>
          {issues.map((i, idx) => (
            <Row key={idx} gap={spacing.sm}>
              <Icon name="alert-circle" size={16} color={t.danger} />
              <Text color={t.danger} style={{ flex: 1 }}>{i.message}</Text>
            </Row>
          ))}
          <Button title="Remove unavailable items" kind="danger" size="sm" onPress={() => cart.removeItems(issues.map((i) => i.menuItemId))} />
        </Card>
      ) : null}
      {quote.error && !issues.length ? (
        <Card variant="outlined" style={{ backgroundColor: t.dangerSoft, borderColor: t.danger }}>
          <Row gap={spacing.sm}>
            <Icon name="alert-circle" size={16} color={t.danger} />
            <Text color={t.danger} style={{ flex: 1 }}>{errorMessage(quote.error)}</Text>
          </Row>
        </Card>
      ) : null}
      {quote.data?.warnings.map((w, i) => (
        <Row key={i} gap={spacing.sm} style={[styles.warning, { backgroundColor: t.warningSoft }]}>
          <Icon name="trending-up" size={16} color={t.warning} />
          <Text variant="caption" color={t.text} style={{ flex: 1 }}>{w.message}: {formatPaise(w.previousPaise)} → {formatPaise(w.currentPaise)}</Text>
        </Row>
      ))}

      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.sm}>
          <Icon name="pricetag" size={18} color={t.brandText} />
          <Text variant="heading">Offers & coupons</Text>
        </Row>
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Input
              value={couponInput}
              onChangeText={(v) => setCouponInput(v.toUpperCase())}
              placeholder="Enter coupon code"
              icon="ticket-outline"
              autoCapitalize="characters"
              editable={!cart.couponCode}
              error={quote.data?.couponError?.message}
            />
          </View>
          {cart.couponCode ? (
            <Button title="Remove" kind="ghost" onPress={() => { cart.setCoupon(null); setCouponInput(''); }} style={{ minHeight: 52 }} />
          ) : (
            <Button title="Apply" kind="secondary" disabled={couponInput.length < 3} onPress={() => cart.setCoupon(couponInput.trim())} style={{ minHeight: 52 }} />
          )}
        </Row>
        {cart.couponCode && quote.data?.pricing.discountPaise ? (
          <Row gap={spacing.sm} style={[styles.saved, { backgroundColor: t.limeSoft }]}>
            <Icon name="checkmark-circle" size={18} color={t.success} />
            <Text variant="label" color={t.success}>You save {formatPaise(quote.data.pricing.discountPaise)} with {cart.couponCode}</Text>
          </Row>
        ) : null}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.sm}>
          <Icon name="location" size={18} color={t.brandText} />
          <Text variant="heading">Deliver to</Text>
        </Row>
        {savedServiceable.map((a) => {
          const selected = addressId === a.id;
          return (
            <Pressable
              key={a.id}
              onPress={() => setAddressId(a.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={[styles.choice, { borderColor: selected ? t.brand : t.border, backgroundColor: selected ? t.brandSoft : 'transparent' }]}>
              <Icon name={a.label === 'home' ? 'home' : a.label === 'work' ? 'briefcase' : 'location'} size={20} color={selected ? t.brandText : t.textMuted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheading">{a.label[0].toUpperCase() + a.label.slice(1)}</Text>
                <Text variant="caption" muted numberOfLines={2}>{a.line1}{a.landmark ? `, ${a.landmark}` : ''}</Text>
              </View>
              <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? t.brand : t.textSubtle} />
            </Pressable>
          );
        })}
        <Button title={savedServiceable.length ? 'Add new address' : 'Add a delivery address'} icon="add" kind={savedServiceable.length ? 'ghost' : 'secondary'} onPress={() => router.push('/addresses/new')} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.sm}>
          <Icon name="heart" size={18} color={t.danger} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">Tip your delivery partner</Text>
            <Text variant="caption" muted>100% of the tip goes to them</Text>
          </View>
        </Row>
        <Row>
          {TIPS.map((tip) => (
            <Chip key={tip} label={tip ? formatPaise(tip) : 'No tip'} icon={tip ? 'cash-outline' : undefined} active={cart.tipPaise === tip} onPress={() => cart.setTip(tip)} />
          ))}
        </Row>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.sm}>
          <Icon name="create" size={18} color={t.brandText} />
          <Text variant="heading">Cooking & delivery instructions</Text>
        </Row>
        <Input value={customerNote} onChangeText={setCustomerNote} placeholder="e.g. Less spicy, leave at door, gate code 4B" maxLength={300} multiline />
      </Card>

      {quote.data ? <BillCard pricing={quote.data.pricing} /> : null}

      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.sm}>
          <Icon name="wallet" size={18} color={t.brandText} />
          <Text variant="heading">Pay with</Text>
        </Row>
        <PayOption icon="card" label="UPI, cards & netbanking" hint="Pay securely with Razorpay" active={method === 'online'} onPress={() => setMethod('online')} />
        <PayOption
          icon="cash"
          label="Cash on delivery"
          hint={quote.data && !quote.data.codAvailable ? 'Not available for this order' : 'Pay the delivery partner'}
          active={method === 'cod'}
          disabled={quote.data ? !quote.data.codAvailable : false}
          onPress={() => setMethod('cod')}
        />
      </Card>
      <Row gap={spacing.sm} justify="center">
        <Icon name="shield-checkmark" size={14} color={t.textSubtle} />
        <Text variant="caption" subtle>Safe and secure payments</Text>
      </Row>
    </Screen>
  );
}

function BillCard({ pricing: p }: { pricing: PriceBreakdown }) {
  const t = useTheme();
  const line = (label: string, paise: number, opts: { negative?: boolean; hideZero?: boolean } = {}) =>
    opts.hideZero && !paise ? null : (
      <Row justify="space-between" key={label}>
        <Text muted>{label}</Text>
        <Text color={opts.negative ? t.success : undefined}>{opts.negative ? '−' : ''}{formatPaise(paise)}</Text>
      </Row>
    );
  return (
    <Card style={{ gap: spacing.sm }}>
      <Row gap={spacing.sm} style={{ marginBottom: spacing.xs }}>
        <Icon name="receipt" size={18} color={t.brandText} />
        <Text variant="heading">Bill details</Text>
      </Row>
      {line('Item total', p.itemTotalPaise)}
      {line('Packaging', p.packagingFeePaise, { hideZero: true })}
      {p.deliveryFeeWaivedPaise ? (
        <Row justify="space-between">
          <Text muted>Delivery fee</Text>
          <Row gap={6}>
            <Text subtle style={{ textDecorationLine: 'line-through' }}>{formatPaise(p.deliveryFeeWaivedPaise)}</Text>
            <Text color={t.success} style={{ fontWeight: '700' }}>FREE</Text>
          </Row>
        </Row>
      ) : (
        line(`Delivery fee${p.surgeMultiplier > 1 ? ' (high demand)' : ''}`, p.deliveryFeePaise)
      )}
      {line('Rain surcharge', p.rainSurchargePaise, { hideZero: true })}
      {line('Platform fee', p.platformFeePaise)}
      {line('Taxes', p.taxPaise)}
      {line('Delivery tip', p.tipPaise, { hideZero: true })}
      {line(`Discount${p.couponCode ? ` (${p.couponCode})` : ''}`, p.discountPaise, { negative: true, hideZero: true })}
      <View style={[styles.dashed, { borderColor: t.border }]} />
      <Row justify="space-between">
        <Text variant="heading">To pay</Text>
        <Text variant="heading">{formatPaise(p.totalPaise)}</Text>
      </Row>
    </Card>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.stepper, { borderColor: t.border, backgroundColor: t.surfaceRaised }]}>
      <Pressable onPress={() => onChange(value - 1)} hitSlop={8} accessibilityLabel="Decrease quantity">
        <Icon name={value === 1 ? 'trash-outline' : 'remove'} size={16} color={t.brandText} />
      </Pressable>
      <Text variant="subheading" color={t.brandText} style={{ fontWeight: '800', minWidth: 14, textAlign: 'center' }}>{value}</Text>
      <Pressable onPress={() => onChange(value + 1)} hitSlop={8} accessibilityLabel="Increase quantity">
        <Icon name="add" size={16} color={t.brandText} />
      </Pressable>
    </View>
  );
}

function PayOption({ icon, label, hint, active, disabled, onPress }: { icon: IconName; label: string; hint: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      style={[styles.choice, { borderColor: active ? t.brand : t.border, backgroundColor: active ? t.brandSoft : 'transparent', opacity: disabled ? 0.45 : 1 }]}>
      <IconBadge name={icon} size={36} shape="square" background={active ? t.surfaceRaised : t.surface} color={active ? t.brandText : t.textMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subheading">{label}</Text>
        <Text variant="caption" muted>{hint}</Text>
      </View>
      <Icon name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? t.brand : t.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md },
  warning: { borderRadius: radius.md, padding: spacing.md },
  saved: { borderRadius: radius.sm, padding: spacing.sm },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', marginVertical: spacing.xs },
});
