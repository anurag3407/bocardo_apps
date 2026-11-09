import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import type { PartnerRestaurant } from '@/core/api/generated/model';
import { signOut } from '@/core/auth/auth-actions';
import {
  Badge,
  Button,
  Card,
  Icon,
  IconBadge,
  Row,
  Screen,
  Text,
  radius,
  spacing,
  useTheme,
} from '@/ui';

export interface OnboardingStatusViewProps {
  restaurant: PartnerRestaurant;
  onEditAndResubmit?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function OnboardingStatusView({
  restaurant,
  onEditAndResubmit,
  onRefresh,
  refreshing,
}: OnboardingStatusViewProps) {
  const t = useTheme();
  const [showDetails, setShowDetails] = useState(false);
  const isRejected = restaurant.status === 'rejected';
  const isSuspended = restaurant.status === 'suspended';
  const isPending = restaurant.status === 'pending';

  return (
    <Screen scroll tone="surface">
      {/* Top Banner */}
      <Card
        style={{
          backgroundColor: isRejected ? t.dangerSoft : isSuspended ? t.warningSoft : t.sky,
          gap: spacing.md,
        }}
      >
        <Row justify="space-between" style={{ alignItems: 'flex-start' }}>
          <IconBadge
            name={isRejected ? 'alert-circle' : isSuspended ? 'warning' : 'hourglass'}
            size={48}
            background={t.surfaceRaised}
            color={isRejected ? t.dangerText : isSuspended ? t.warningText : t.brandText}
          />
          <Badge
            label={restaurant.status.toUpperCase()}
            tone={isRejected ? 'danger' : isSuspended ? 'warning' : 'neutral'}
            solid
          />
        </Row>

        <View style={{ gap: 4 }}>
          <Text variant="title" color={t.ink}>
            {isRejected
              ? 'Action Required: Verification Rejected'
              : isSuspended
                ? 'Outlet Suspended'
                : 'Application Under Review'}
          </Text>
          <Text color={t.ink} style={{ opacity: 0.8 }}>
            {isRejected
              ? 'Bocardo Operations requested corrections before your restaurant can go live.'
              : isSuspended
                ? 'Your outlet has been temporarily suspended by Bocardo operations.'
                : 'We are verifying your documents and regulatory licences. SLA: 24–48 hours.'}
          </Text>
        </View>

        {restaurant.rejectionReason ? (
          <View
            style={[
              styles.reasonBox,
              {
                backgroundColor: isRejected ? '#FEE2E2' : '#FEF3C7',
                borderColor: isRejected ? t.danger : t.warning,
              },
            ]}
          >
            <Row gap={spacing.xs}>
              <Icon
                name="information-circle"
                size={16}
                color={isRejected ? t.dangerText : t.warningText}
              />
              <Text
                variant="label"
                color={isRejected ? t.dangerText : t.warningText}
                style={{ fontWeight: '700' }}
              >
                Ops Team Feedback:
              </Text>
            </Row>
            <Text variant="body" color={t.ink} style={{ marginTop: 2 }}>
              {restaurant.rejectionReason}
            </Text>
          </View>
        ) : null}

        {isRejected && onEditAndResubmit ? (
          <Button
            title="Edit Details & Resubmit"
            icon="create-outline"
            kind="primary"
            size="lg"
            onPress={onEditAndResubmit}
          />
        ) : null}
      </Card>

      {/* Verification Stages Timeline (shown when pending) */}
      {isPending ? (
        <Card style={{ gap: spacing.md }}>
          <Text variant="heading">Verification Progress</Text>

          <View style={styles.timeline}>
            {/* Step 1 */}
            <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
              <View
                style={[
                  styles.timelineDot,
                  { backgroundColor: t.success, borderColor: t.success },
                ]}
              >
                <Icon name="checkmark" size={12} color="#FFF" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" style={{ fontWeight: '700' }}>
                  Application & Location Submitted
                </Text>
                <Text variant="caption" muted>
                  {restaurant.name} · {restaurant.addressLine}
                </Text>
              </View>
            </Row>

            <View style={[styles.timelineLine, { backgroundColor: t.success }]} />

            {/* Step 2 */}
            <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
              <View
                style={[
                  styles.timelineDot,
                  { backgroundColor: t.brand, borderColor: t.brand },
                ]}
              >
                <Icon name="time" size={12} color="#FFF" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" style={{ fontWeight: '700', color: t.brandText }}>
                  FSSAI & Regulatory Compliance Check
                </Text>
                <Text variant="caption" muted>
                  Validating 14-digit FSSAI licence and food safety certificate.
                </Text>
              </View>
            </Row>

            <View style={[styles.timelineLine, { backgroundColor: t.border }]} />

            {/* Step 3 */}
            <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
              <View
                style={[
                  styles.timelineDot,
                  { backgroundColor: t.surfaceRaised, borderColor: t.border },
                ]}
              >
                <Icon name="business-outline" size={12} color={t.textSubtle} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" muted>
                  Payout & Bank Account Setup
                </Text>
                <Text variant="caption" muted>
                  Verifying IFSC, account holder details, and automated payout routes.
                </Text>
              </View>
            </Row>

            <View style={[styles.timelineLine, { backgroundColor: t.border }]} />

            {/* Step 4 */}
            <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
              <View
                style={[
                  styles.timelineDot,
                  { backgroundColor: t.surfaceRaised, borderColor: t.border },
                ]}
              >
                <Icon name="storefront-outline" size={12} color={t.textSubtle} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" muted>
                  Final Ops Review & Going Live
                </Text>
                <Text variant="caption" muted>
                  Setting delivery radius and commission terms.
                </Text>
              </View>
            </Row>
          </View>
        </Card>
      ) : null}

      {/* Submitted Details Summary */}
      <Card style={{ gap: spacing.md }}>
        <Row justify="space-between" style={{ alignItems: 'center' }}>
          <Text variant="heading">Application Details</Text>
          <Button
            title={showDetails ? 'Hide' : 'View'}
            kind="ghost"
            size="sm"
            onPress={() => setShowDetails((s) => !s)}
          />
        </Row>

        <Row justify="space-between">
          <Text variant="caption" muted>
            Restaurant
          </Text>
          <Text variant="caption" style={{ fontWeight: '600' }}>
            {restaurant.name}
          </Text>
        </Row>

        <Row justify="space-between">
          <Text variant="caption" muted>
            Cuisines
          </Text>
          <Text variant="caption" style={{ fontWeight: '600' }}>
            {restaurant.cuisines.join(', ')}
          </Text>
        </Row>

        <Row justify="space-between">
          <Text variant="caption" muted>
            Contact
          </Text>
          <Text variant="caption" style={{ fontWeight: '600' }}>
            {restaurant.phone ?? '—'}
          </Text>
        </Row>

        {showDetails ? (
          <View style={{ gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderColor: t.border }}>
            <Row justify="space-between">
              <Text variant="caption" muted>
                Owner
              </Text>
              <Text variant="caption" style={{ fontWeight: '600' }}>
                {restaurant.ownerName ?? '—'}
              </Text>
            </Row>
            <Row justify="space-between">
              <Text variant="caption" muted>
                FSSAI Licence
              </Text>
              <Text variant="caption" style={{ fontWeight: '600' }}>
                {restaurant.fssaiLicense ?? '—'}{' '}
                {restaurant.fssaiExpiryDate ? `(Exp: ${restaurant.fssaiExpiryDate})` : ''}
              </Text>
            </Row>
            <Row justify="space-between">
              <Text variant="caption" muted>
                Legal Entity / PAN
              </Text>
              <Text variant="caption" style={{ fontWeight: '600' }}>
                {restaurant.legalEntityName ?? '—'} ({restaurant.panNumber ?? '—'})
              </Text>
            </Row>
            <Row justify="space-between">
              <Text variant="caption" muted>
                GSTIN
              </Text>
              <Text variant="caption" style={{ fontWeight: '600' }}>
                {restaurant.gstin ?? 'Exempted / Not provided'}
              </Text>
            </Row>
            <Row justify="space-between">
              <Text variant="caption" muted>
                Bank Account
              </Text>
              <Text variant="caption" style={{ fontWeight: '600' }}>
                {restaurant.bankBeneficiaryName ?? '—'} · {restaurant.bankName ?? 'Bank'} (
                {restaurant.bankAccountNumber ?? '—'})
              </Text>
            </Row>
            <Row justify="space-between">
              <Text variant="caption" muted>
                IFSC Code
              </Text>
              <Text variant="caption" style={{ fontWeight: '600' }}>
                {restaurant.bankIfsc ?? '—'}
              </Text>
            </Row>
          </View>
        ) : null}
      </Card>

      {/* Action Buttons */}
      <View style={{ gap: spacing.sm }}>
        {onRefresh ? (
          <Button
            title="Check Approval Status"
            icon="refresh"
            kind="secondary"
            loading={refreshing}
            onPress={onRefresh}
          />
        ) : null}
        {isSuspended || isRejected ? (
          <Button
            title="Contact Partner Support"
            icon="chatbubbles-outline"
            kind="ghost"
            onPress={() => router.push('/support/new')}
          />
        ) : null}
        <Button
          title="Sign Out"
          kind="ghost"
          icon="log-out-outline"
          onPress={() => void signOut()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  reasonBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  timeline: {
    paddingLeft: spacing.xs,
    gap: spacing.xs,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  timelineLine: {
    width: 2,
    height: 24,
    marginLeft: 9,
  },
});
