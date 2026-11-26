import { Alert, View } from 'react-native';
import type { RiderProfile } from '@/core/api/generated/model';
import { signOut } from '@/core/auth/auth-actions';
import { Badge, Button, Card, Divider, Icon, Logo, Row, Screen, spacing, Text, useTheme } from '@/ui';

interface RiderKycStatusViewProps {
  rider: RiderProfile;
  onRefresh: () => void;
  onEdit: () => void;
}

export function RiderKycStatusView({ rider, onRefresh, onEdit }: RiderKycStatusViewProps) {
  const t = useTheme();
  const isPending = rider.kycStatus === 'pending';
  const isRejected = rider.kycStatus === 'rejected';

  const maskedAadhaar = rider.aadhaarNumber
    ? `•••• •••• ${rider.aadhaarNumber.slice(-4)}`
    : 'Not provided';
  const maskedBank = rider.bankAccountNumber
    ? `•••• •••• ${rider.bankAccountNumber.slice(-4)}`
    : 'Not provided';

  return (
    <Screen scroll tone="surface">
      <Row justify="space-between" style={{ alignItems: 'center' }}>
        <Logo size={36} wordmark tag="Partner" />
        <Button
          title="Sign out"
          kind="ghost"
          size="sm"
          icon="log-out-outline"
          onPress={() => void signOut()}
        />
      </Row>

      {/* Main Status Header Card */}
      {isPending ? (
        <Card style={{ backgroundColor: t.sunSoft, borderColor: t.sun, gap: spacing.md }}>
          <Row justify="space-between" style={{ alignItems: 'center' }}>
            <Badge label="Under Review" tone="sun" icon="time-outline" />
            <Text variant="caption" muted>Ref: {rider.id.slice(0, 8)}</Text>
          </Row>
          <View style={{ gap: spacing.xs }}>
            <Text variant="title" color={t.warningText}>KYC Verification in Progress</Text>
            <Text variant="body" color={t.ink}>
              Our compliance team is verifying your government identity, driving licence, and bank details.
              Verification typically takes 2–4 hours during business hours.
            </Text>
          </View>
          <Row gap={spacing.sm}>
            <Button
              title="Check Status"
              kind="secondary"
              icon="refresh"
              size="sm"
              onPress={onRefresh}
            />
            <Button
              title="Edit Application"
              kind="ghost"
              icon="create-outline"
              size="sm"
              onPress={onEdit}
            />
          </Row>
        </Card>
      ) : isRejected ? (
        <Card style={{ backgroundColor: t.dangerSoft, borderColor: t.danger, gap: spacing.md }}>
          <Row justify="space-between" style={{ alignItems: 'center' }}>
            <Badge label="Action Required" tone="danger" icon="alert-circle" />
            <Text variant="caption" muted>Ref: {rider.id.slice(0, 8)}</Text>
          </Row>
          <View style={{ gap: spacing.xs }}>
            <Text variant="title" color={t.dangerText}>Verification Update Needed</Text>
            <Text variant="body" color={t.ink}>
              Your documents could not be approved due to the following reason:
            </Text>
          </View>
          <Card style={{ backgroundColor: t.surface, borderColor: t.danger, padding: spacing.md }}>
            <Row gap={spacing.xs} style={{ alignItems: 'center' }}>
              <Icon name="information-circle" size={18} color={t.dangerText} />
              <Text variant="label" color={t.dangerText} style={{ fontWeight: '700' }}>Reason from Compliance Ops</Text>
            </Row>
            <Text variant="body" style={{ marginTop: spacing.xs, fontWeight: '500' }}>
              {rider.rejectionReason ?? 'Please ensure all document photos are clear, uncropped, and match your name.'}
            </Text>
          </Card>
          <Button
            title="Update & Resubmit Documents"
            icon="arrow-forward"
            size="lg"
            onPress={onEdit}
          />
        </Card>
      ) : (
        <Card style={{ backgroundColor: t.dangerSoft, borderColor: t.danger, gap: spacing.md }}>
          <Badge label="Account Suspended" tone="danger" icon="ban" />
          <Text variant="title" color={t.dangerText}>Account Suspended</Text>
          <Text variant="body">
            {rider.rejectionReason ?? 'Your delivery partner account has been suspended by operations.'}
          </Text>
          <Button
            title="Contact Support"
            kind="secondary"
            icon="call-outline"
            onPress={() => Alert.alert('Support Helpline', 'Please contact support at 1800-BOCARDO or email riders@bocardo.in')}
          />
        </Card>
      )}

      {/* Submitted Details Inspection */}
      <Card style={{ gap: spacing.md }}>
        <Text variant="title" style={{ fontSize: 18 }}>Submitted Application</Text>
        
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" muted>PERSONAL & EMERGENCY</Text>
          <Row justify="space-between">
            <Text muted>Full Name</Text>
            <Text style={{ fontWeight: '600' }}>{rider.fullName ?? '—'}</Text>
          </Row>
          <Row justify="space-between">
            <Text muted>Date of Birth</Text>
            <Text style={{ fontWeight: '600' }}>{rider.dob ? rider.dob.slice(0, 10) : '—'}</Text>
          </Row>
          <Row justify="space-between">
            <Text muted>Emergency Contact</Text>
            <Text style={{ fontWeight: '600' }}>
              {rider.emergencyContactName ? `${rider.emergencyContactName} (${rider.emergencyContactRelation ?? 'Relation'})` : '—'}
            </Text>
          </Row>
          <Row justify="space-between">
            <Text muted>Emergency Phone</Text>
            <Text style={{ fontWeight: '600' }}>{rider.emergencyContactPhone ?? '—'}</Text>
          </Row>
        </View>

        <Divider />

        <View style={{ gap: spacing.sm }}>
          <Text variant="label" muted>VEHICLE & LICENCE</Text>
          <Row justify="space-between">
            <Text muted>Vehicle Type</Text>
            <Text style={{ fontWeight: '600', textTransform: 'capitalize' }}>{rider.vehicleType}</Text>
          </Row>
          {rider.vehicleType !== 'bicycle' ? (
            <>
              <Row justify="space-between">
                <Text muted>Vehicle Number</Text>
                <Text style={{ fontWeight: '600' }}>{rider.vehicleNumber ?? '—'}</Text>
              </Row>
              <Row justify="space-between">
                <Text muted>Driving Licence</Text>
                <Text style={{ fontWeight: '600' }}>{rider.licenseNumber ?? '—'}</Text>
              </Row>
              <Row justify="space-between">
                <Text muted>Licence Expiry</Text>
                <Text style={{ fontWeight: '600' }}>{rider.licenseExpiryDate ? rider.licenseExpiryDate.slice(0, 10) : '—'}</Text>
              </Row>
            </>
          ) : null}
        </View>

        <Divider />

        <View style={{ gap: spacing.sm }}>
          <Text variant="label" muted>GOVERNMENT KYC</Text>
          <Row justify="space-between">
            <Text muted>Aadhaar Number</Text>
            <Text style={{ fontWeight: '600' }}>{maskedAadhaar}</Text>
          </Row>
          <Row justify="space-between">
            <Text muted>PAN Card</Text>
            <Text style={{ fontWeight: '600' }}>{rider.panNumber ?? '—'}</Text>
          </Row>
        </View>

        <Divider />

        <View style={{ gap: spacing.sm }}>
          <Text variant="label" muted>PAYOUT BANK ACCOUNT</Text>
          <Row justify="space-between">
            <Text muted>Account Holder</Text>
            <Text style={{ fontWeight: '600' }}>{rider.bankBeneficiaryName ?? '—'}</Text>
          </Row>
          <Row justify="space-between">
            <Text muted>Bank Name</Text>
            <Text style={{ fontWeight: '600' }}>{rider.bankName ?? '—'}</Text>
          </Row>
          <Row justify="space-between">
            <Text muted>Account Number</Text>
            <Text style={{ fontWeight: '600' }}>{maskedBank}</Text>
          </Row>
          <Row justify="space-between">
            <Text muted>IFSC Code</Text>
            <Text style={{ fontWeight: '600' }}>{rider.bankIfsc ?? '—'}</Text>
          </Row>
        </View>
      </Card>

      {/* Guidelines & Safety Card */}
      <Card style={{ backgroundColor: t.surfaceRaised, gap: spacing.sm }}>
        <Row gap={spacing.xs} style={{ alignItems: 'center' }}>
          <Icon name="shield-checkmark" size={18} color={t.brandText} />
          <Text variant="label" style={{ fontWeight: '700' }}>Bocardo Rider Guarantee</Text>
        </Row>
        <Text variant="caption" muted>
          Every verified Bocardo delivery partner is covered by on-duty accidental insurance and receives weekly direct bank deposits with 100% tip pass-through.
        </Text>
      </Card>
    </Screen>
  );
}
