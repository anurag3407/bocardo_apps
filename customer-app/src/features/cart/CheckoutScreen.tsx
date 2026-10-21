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
import { Button, Card, Divider, EmptyState, Input, radius, Row, Screen, spacing, Text, useTheme, VegMark } from '@/ui';
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
    return <Screen><EmptyState title="Your cart is empty" message="Add something delicious to get started." action={{ label: 'Browse restaurants', onPress: () => router.replace('/') }} /></Screen>;
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

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        <Button
          size="lg"
          title={quote.data ? `${method === 'cod' ? 'Place order' : 'Pay'} · ${formatPaise(quote.data.pricing.totalPaise)}` : 'Place order'}
          disabled={!quote.data || quote.isFetching || !!quote.error}
          loading={placing}
          onPress={place}
        />
      }>
      <Text variant="heading">{cart.restaurantName}</Text>

      <Card style={{ gap: spacing.md }}>
        {cart.lines.map((l) => (
          <Row key={l.key} justify="space-between">
            <View style={{ flex: 1, gap: 2 }}>
              <Row><VegMark veg={l.isVeg} /><Text>{l.name}</Text></Row>
              {l.variantName || l.addonNames.length ? <Text variant="caption" muted>{[l.variantName, ...l.addonNames].filter(Boolean).join(', ')}</Text> : null}
            </View>
            <Stepper value={l.quantity} onChange={(n) => cart.setQuantity(l.key, n)} />
            <Text style={{ width: 70, textAlign: 'right' }}>{formatPaise(l.unitPricePaise * l.quantity)}</Text>
          </Row>
        ))}
      </Card>

      {issues.length ? (
        <Card style={{ backgroundColor: t.brandSoft, gap: spacing.sm }}>
          {issues.map((i, idx) => <Text key={idx} color={t.danger}>• {i.message}</Text>)}
          <Button title="Remove unavailable items" kind="secondary" onPress={() => cart.removeItems(issues.map((i) => i.menuItemId))} />
        </Card>
      ) : null}
      {quote.error && !issues.length ? <Card style={{ backgroundColor: t.brandSoft }}><Text color={t.danger}>{errorMessage(quote.error)}</Text></Card> : null}
      {quote.data?.warnings.map((w, i) => <Text key={i} variant="caption" color={t.warning}>⚠ {w.message}: {formatPaise(w.previousPaise)} → {formatPaise(w.currentPaise)}</Text>)}

      <Text variant="label">Deliver to</Text>
      {savedServiceable.length ? (
        savedServiceable.map((a) => (
          <Pressable key={a.id} onPress={() => setAddressId(a.id)}>
            <Card style={{ borderColor: addressId === a.id ? t.brand : t.border, borderWidth: addressId === a.id ? 2 : StyleSheet.hairlineWidth }}>
              <Text variant="label">{a.label.toUpperCase()}</Text>
              <Text muted numberOfLines={2}>{a.line1}{a.landmark ? `, ${a.landmark}` : ''}</Text>
            </Card>
          </Pressable>
        ))
      ) : (
        <Button title="Add a delivery address" kind="secondary" onPress={() => router.push('/addresses/new')} />
      )}

      <Text variant="label">Offers</Text>
      <Row>
        <View style={{ flex: 1 }}>
          <Input value={couponInput} onChangeText={(v) => setCouponInput(v.toUpperCase())} placeholder="Coupon code" autoCapitalize="characters" error={quote.data?.couponError?.message} />
        </View>
        {cart.couponCode ? (
          <Button title="Remove" kind="ghost" onPress={() => { cart.setCoupon(null); setCouponInput(''); }} />
        ) : (
          <Button title="Apply" kind="secondary" disabled={couponInput.length < 3} onPress={() => cart.setCoupon(couponInput.trim())} />
        )}
      </Row>

      <Text variant="label">Tip your delivery partner</Text>
      <Row>
        {TIPS.map((tip) => (
          <Pressable key={tip} onPress={() => cart.setTip(tip)} style={[styles.pill, { borderColor: cart.tipPaise === tip ? t.brand : t.border, backgroundColor: cart.tipPaise === tip ? t.brandSoft : 'transparent' }]}>
            <Text variant="label">{tip ? formatPaise(tip) : 'No tip'}</Text>
          </Pressable>
        ))}
      </Row>

      <Text variant="label">Cooking & delivery instructions</Text>
      <Input
        value={customerNote}
        onChangeText={setCustomerNote}
        placeholder="e.g. Less spicy, leave at door, gate code 4B"
        maxLength={300}
      />

      {quote.data ? <BillCard pricing={quote.data.pricing} eta={quote.data.etaMinutes} /> : null}

      <Text variant="label">Pay with</Text>
      <Row>
        <PayOption label="UPI / Card / Netbanking" active={method === 'online'} onPress={() => setMethod('online')} />
        <PayOption label="Cash on delivery" active={method === 'cod'} disabled={quote.data ? !quote.data.codAvailable : false} onPress={() => setMethod('cod')} />
      </Row>
    </Screen>
  );
}

function BillCard({ pricing: p, eta }: { pricing: PriceBreakdown; eta: number }) {
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
      <Text variant="label">Bill details · arrives in ~{eta} min</Text>
      {line('Item total', p.itemTotalPaise)}
      {line('Packaging', p.packagingFeePaise, { hideZero: true })}
      {p.deliveryFeeWaivedPaise ? <Row justify="space-between"><Text muted>Delivery fee</Text><Text color={t.success}>FREE</Text></Row> : line(`Delivery fee${p.surgeMultiplier > 1 ? ' (high demand)' : ''}`, p.deliveryFeePaise)}
      {line('Rain surcharge', p.rainSurchargePaise, { hideZero: true })}
      {line('Platform fee', p.platformFeePaise)}
      {line('Taxes', p.taxPaise)}
      {line('Tip', p.tipPaise, { hideZero: true })}
      {line(`Discount${p.couponCode ? ` (${p.couponCode})` : ''}`, p.discountPaise, { negative: true, hideZero: true })}
      <Divider />
      <Row justify="space-between"><Text variant="heading">To pay</Text><Text variant="heading">{formatPaise(p.totalPaise)}</Text></Row>
    </Card>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.stepper, { borderColor: t.brand }]}>
      <Pressable onPress={() => onChange(value - 1)} hitSlop={8}><Text color={t.brand}>−</Text></Pressable>
      <Text variant="label" color={t.brand}>{value}</Text>
      <Pressable onPress={() => onChange(value + 1)} hitSlop={8}><Text color={t.brand}>+</Text></Pressable>
    </View>
  );
}

function PayOption({ label, active, disabled, onPress }: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.pay, { borderColor: active ? t.brand : t.border, opacity: disabled ? 0.4 : 1, backgroundColor: active ? t.brandSoft : 'transparent' }]}>
      <Text variant="label">{label}</Text>
      {disabled ? <Text variant="caption" muted>Not available for this order</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 2, marginHorizontal: spacing.sm },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pay: { flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
});
