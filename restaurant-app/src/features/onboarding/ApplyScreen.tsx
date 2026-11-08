import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import {
  partnerApply,
  partnerResubmit,
  usePartnerMyApplication,
} from '@/core/api/generated/partner/partner';
import { refreshClaims, signOut } from '@/core/auth/auth-actions';
import { useSession } from '@/core/auth/session-store';
import { currentLocation } from '@/core/location/current-location';
import { DeliveryMap } from '@/core/maps/delivery-map';
import {
  pickDocumentImage,
  uploadDocument,
  type DocumentType,
} from '@/core/storage/document-upload';
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  Input,
  Loading,
  Logo,
  Row,
  Screen,
  Text,
  Toggle,
  radius,
  spacing,
  useTheme,
} from '@/ui';
import { OnboardingStatusView } from './OnboardingStatusView';

const STEPS = [
  { index: 1, title: 'Restaurant', icon: 'storefront-outline' as const },
  { index: 2, title: 'Location', icon: 'location-outline' as const },
  { index: 3, title: 'Compliance', icon: 'shield-checkmark-outline' as const },
  { index: 4, title: 'Bank Account', icon: 'card-outline' as const },
  { index: 5, title: 'Review', icon: 'checkmark-circle-outline' as const },
];

const POPULAR_CUISINES = [
  'North Indian',
  'Biryani',
  'South Indian',
  'Chinese',
  'Pizza',
  'Burger',
  'Desserts',
  'Mughlai',
  'Beverages',
  'Fast Food',
];

export function ApplyScreen() {
  const t = useTheme();
  const { session } = useSession();
  const userId = session?.user?.id ?? '';
  const myAppQuery = usePartnerMyApplication();
  const existingApp = myAppQuery.data;

  const [step, setStep] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  // Form state initialized with standard fields
  const [form, setForm] = useState({
    // Step 1: Restaurant info
    name: '',
    cuisines: 'North Indian, Biryani',
    phone: '',
    email: '',
    isVegOnly: false,
    costForTwo: '400',
    avgPrepMinutes: '20',
    description: '',
    // Step 2: Location
    addressLine: '',
    // Step 3: Food safety & Tax
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
    legalEntityName: '',
    fssaiLicense: '',
    fssaiExpiryDate: '',
    fssaiDocumentPath: '',
    panNumber: '',
    panDocumentPath: '',
    gstin: '',
    gstDocumentPath: '',
    isGstExempt: false,
    // Step 4: Bank account
    bankBeneficiaryName: '',
    bankName: '',
    bankAccountNumber: '',
    confirmAccountNumber: '',
    bankIfsc: '',
    bankChequeDocumentPath: '',
  });

  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  // Pre-fill form if existing application exists
  useEffect(() => {
    if (existingApp && !isEditing) {
      setForm((prev) => ({
        ...prev,
        name: existingApp.name ?? '',
        cuisines: existingApp.cuisines?.join(', ') ?? '',
        phone: existingApp.phone ?? '',
        email: existingApp.email ?? '',
        isVegOnly: existingApp.isVegOnly ?? false,
        costForTwo: existingApp.costForTwoPaise ? String(Math.round(existingApp.costForTwoPaise / 100)) : '400',
        avgPrepMinutes: String(existingApp.avgPrepMinutes ?? 20),
        addressLine: existingApp.addressLine ?? '',
        ownerName: existingApp.ownerName ?? '',
        ownerPhone: existingApp.ownerPhone ?? '',
        ownerEmail: existingApp.ownerEmail ?? '',
        legalEntityName: existingApp.legalEntityName ?? '',
        fssaiLicense: existingApp.fssaiLicense ?? '',
        fssaiExpiryDate: existingApp.fssaiExpiryDate ?? '',
        fssaiDocumentPath: existingApp.fssaiDocumentPath ?? '',
        panNumber: existingApp.panNumber ?? '',
        panDocumentPath: existingApp.panDocumentPath ?? '',
        gstin: existingApp.gstin ?? '',
        gstDocumentPath: existingApp.gstDocumentPath ?? '',
        isGstExempt: !existingApp.gstin,
        bankBeneficiaryName: existingApp.bankBeneficiaryName ?? '',
        bankName: existingApp.bankName ?? '',
        bankAccountNumber: '',
        confirmAccountNumber: '',
        bankIfsc: existingApp.bankIfsc ?? '',
        bankChequeDocumentPath: existingApp.bankChequeDocumentPath ?? '',
      }));
      if (existingApp.lat && existingApp.lng) {
        setPin({ lat: existingApp.lat, lng: existingApp.lng });
      }
    }
  }, [existingApp, isEditing]);

  const update = (key: keyof typeof form, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const locate = async () => {
    try {
      const loc = await currentLocation();
      setPin(loc);
    } catch (e) {
      Alert.alert('Location needed', (e as Error).message);
    }
  };

  const handleUpload = async (docType: DocumentType, formKey: keyof typeof form) => {
    try {
      setUploadingDoc(docType);
      const uri = await pickDocumentImage();
      if (!uri) return;
      const path = await uploadDocument(userId, docType, uri);
      update(formKey, path);
      Alert.alert('Upload complete', `${docType.toUpperCase()} document uploaded successfully.`);
    } catch (err) {
      Alert.alert('Upload failed', errorMessage(err));
    } finally {
      setUploadingDoc(null);
    }
  };

  // Step validation
  const validateStep = (s: number): boolean => {
    if (s === 1) {
      if (!form.name.trim()) {
        Alert.alert('Required', 'Please enter your restaurant name.');
        return false;
      }
      if (!form.phone.trim() || form.phone.trim().length < 10) {
        Alert.alert('Required', 'Please enter a valid 10-digit restaurant phone number.');
        return false;
      }
      if (!form.cuisines.trim()) {
        Alert.alert('Required', 'Please enter or select at least one cuisine.');
        return false;
      }
      return true;
    }
    if (s === 2) {
      if (!form.addressLine.trim() || form.addressLine.trim().length < 5) {
        Alert.alert('Required', 'Please enter the complete street address of the outlet.');
        return false;
      }
      if (!pin) {
        Alert.alert('Required', 'Please capture or pin your exact restaurant location on the map.');
        return false;
      }
      return true;
    }
    if (s === 3) {
      if (!form.ownerName.trim()) {
        Alert.alert('Required', 'Please enter the owner / applicant full name.');
        return false;
      }
      if (!form.legalEntityName.trim()) {
        Alert.alert('Required', 'Please enter the legal registered business name.');
        return false;
      }
      // FSSAI 14-digit check
      const fssai = form.fssaiLicense.trim();
      if (!/^\d{14}$/.test(fssai)) {
        Alert.alert(
          'FSSAI Licence Required',
          'Indian food safety regulations mandate a valid 14-digit FSSAI registration/licence number.',
        );
        return false;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.fssaiExpiryDate.trim())) {
        Alert.alert('FSSAI Expiry Required', 'Please enter FSSAI expiry date in YYYY-MM-DD format.');
        return false;
      }
      if (!form.fssaiDocumentPath) {
        Alert.alert('FSSAI Certificate Required', 'Please upload a photo or scan of your FSSAI certificate.');
        return false;
      }
      // PAN validation
      const pan = form.panNumber.trim().toUpperCase();
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
        Alert.alert('Valid PAN Required', 'Please enter a valid 10-character PAN number (e.g. ABCDE1234F).');
        return false;
      }
      if (!form.panDocumentPath) {
        Alert.alert('PAN Document Required', 'Please upload a clear photo of the business or proprietor PAN card.');
        return false;
      }
      // GSTIN check if not exempt
      if (!form.isGstExempt && form.gstin.trim()) {
        const gst = form.gstin.trim().toUpperCase();
        if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst)) {
          Alert.alert('Invalid GSTIN', 'Please enter a valid 15-character GSTIN or mark GST as exempted.');
          return false;
        }
      }
      return true;
    }
    if (s === 4) {
      if (!form.bankBeneficiaryName.trim()) {
        Alert.alert('Required', 'Please enter the bank account holder / beneficiary name.');
        return false;
      }
      if (!form.bankName.trim()) {
        Alert.alert('Required', 'Please enter your bank name (e.g. HDFC, ICICI, SBI).');
        return false;
      }
      if (!form.bankAccountNumber.trim() || form.bankAccountNumber.trim().length < 8) {
        Alert.alert('Required', 'Please enter a valid bank account number.');
        return false;
      }
      if (!isEditing && form.bankAccountNumber.trim() !== form.confirmAccountNumber.trim()) {
        Alert.alert('Account Mismatch', 'The bank account numbers do not match. Please check again.');
        return false;
      }
      const ifsc = form.bankIfsc.trim().toUpperCase();
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        Alert.alert('Invalid IFSC Code', 'Please enter a valid 11-character Indian Bank IFSC code (e.g. SBIN0001234).');
        return false;
      }
      return true;
    }
    return true;
  };

  const next = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length));
    }
  };

  const back = () => {
    setStep((s) => Math.max(s - 1, 1));
  };

  const submit = async () => {
    if (!pin) return Alert.alert('Pin your outlet', 'Please capture your restaurant location.');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        cuisines: form.cuisines
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        addressLine: form.addressLine.trim(),
        lat: pin.lat,
        lng: pin.lng,
        ownerName: form.ownerName.trim(),
        ownerPhone: form.ownerPhone.trim() || form.phone.trim(),
        ownerEmail: form.ownerEmail.trim() || form.email.trim() || undefined,
        legalEntityName: form.legalEntityName.trim(),
        fssaiLicense: form.fssaiLicense.trim(),
        fssaiExpiryDate: form.fssaiExpiryDate.trim(),
        fssaiDocumentPath: form.fssaiDocumentPath,
        panNumber: form.panNumber.trim().toUpperCase(),
        panDocumentPath: form.panDocumentPath,
        gstin: !form.isGstExempt && form.gstin.trim() ? form.gstin.trim().toUpperCase() : undefined,
        gstDocumentPath: form.gstDocumentPath || undefined,
        bankAccountNumber: form.bankAccountNumber.trim(),
        bankIfsc: form.bankIfsc.trim().toUpperCase(),
        bankBeneficiaryName: form.bankBeneficiaryName.trim(),
        bankName: form.bankName.trim(),
        bankChequeDocumentPath: form.bankChequeDocumentPath || undefined,
        costForTwoPaise: Number(form.costForTwo) ? Number(form.costForTwo) * 100 : undefined,
        isVegOnly: form.isVegOnly,
        avgPrepMinutes: Number(form.avgPrepMinutes) || 20,
      };

      if (isEditing && existingApp) {
        await partnerResubmit(existingApp.id, payload);
        Alert.alert(
          'Application Resubmitted',
          'Your updated details and documents have been sent to Bocardo Ops for review.',
        );
        setIsEditing(false);
      } else {
        await partnerApply(payload);
        Alert.alert(
          'Application Submitted!',
          'Your restaurant details and FSSAI documents have been submitted to Bocardo Ops.',
        );
      }

      await refreshClaims();
      await myAppQuery.refetch();
    } catch (e) {
      Alert.alert('Could not submit', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // If application already exists and user is NOT in edit mode, show status screen
  if (myAppQuery.isLoading) return <Loading />;
  if (existingApp && !isEditing && existingApp.status !== 'active') {
    return (
      <OnboardingStatusView
        restaurant={existingApp}
        onRefresh={() => void myAppQuery.refetch()}
        refreshing={myAppQuery.isRefetching}
        onEditAndResubmit={() => {
          setIsEditing(true);
          setStep(1);
        }}
      />
    );
  }

  return (
    <Screen
      scroll
      tone="surface"
      footer={
        <Row gap={spacing.md}>
          {step > 1 ? (
            <Button title="Back" kind="secondary" size="lg" onPress={back} style={{ flex: 1 }} />
          ) : null}
          {step < STEPS.length ? (
            <Button title="Next step" size="lg" onPress={next} style={{ flex: 2 }} />
          ) : (
            <Button
              title={isEditing ? 'Resubmit for review' : 'Submit for review'}
              icon="send"
              size="lg"
              loading={saving}
              onPress={submit}
              style={{ flex: 2 }}
            />
          )}
        </Row>
      }
    >
      {/* Header Banner */}
      <Card style={{ backgroundColor: t.sky, gap: spacing.sm }}>
        <Row justify="space-between" style={{ alignItems: 'center' }}>
          <Logo size={40} wordmark tag="Partner" />
          <Badge label={`Step ${step} of ${STEPS.length}`} tone="brand" />
        </Row>
        <Text variant="title" color={t.ink}>
          {isEditing ? 'Update & Resubmit Application' : 'Partner with Bocardo'}
        </Text>
        <Text color={t.ink} style={{ opacity: 0.8 }}>
          {isEditing
            ? 'Fix the flagged documents or details below and resubmit for verification.'
            : 'FSSAI compliant restaurant onboarding. Our team verifies credentials within 24–48 hours.'}
        </Text>
      </Card>

      {/* Rejection Note in Edit Mode */}
      {isEditing && existingApp?.rejectionReason ? (
        <Card style={{ backgroundColor: '#FEE2E2', borderColor: t.danger, borderWidth: 1, gap: 4 }}>
          <Row gap={spacing.xs}>
            <Icon name="alert-circle" size={16} color={t.dangerText} />
            <Text variant="label" color={t.dangerText} style={{ fontWeight: '700' }}>
              Reason for correction:
            </Text>
          </Row>
          <Text variant="body" color={t.ink}>
            {existingApp.rejectionReason}
          </Text>
        </Card>
      ) : null}

      {/* Step Navigator Bar */}
      <Row gap={spacing.xs} style={styles.stepBar}>
        {STEPS.map((s) => (
          <TouchableOpacity
            key={s.index}
            onPress={() => s.index < step && setStep(s.index)}
            style={[
              styles.stepItem,
              {
                backgroundColor: s.index === step ? t.brand : s.index < step ? t.success : t.surfaceRaised,
              },
            ]}
          >
            <Icon
              name={s.index < step ? 'checkmark' : s.icon}
              size={14}
              color={s.index <= step ? '#FFF' : t.textSubtle}
            />
            <Text
              variant="caption"
              color={s.index <= step ? '#FFF' : t.textSubtle}
              style={{ fontWeight: '700' }}
            >
              {s.title}
            </Text>
          </TouchableOpacity>
        ))}
      </Row>

      {/* ── STEP 1: Restaurant Details ────────────────────────────────────── */}
      {step === 1 ? (
        <Card style={{ gap: spacing.lg }}>
          <Text variant="heading">Restaurant & Cuisine</Text>
          <Input
            label="Restaurant name *"
            icon="storefront-outline"
            placeholder="e.g. Biryani Paradise"
            value={form.name}
            onChangeText={(v) => update('name', v)}
          />

          <View style={{ gap: spacing.xs }}>
            <Input
              label="Cuisines *"
              icon="restaurant-outline"
              placeholder="North Indian, Biryani"
              hint="Comma separated"
              value={form.cuisines}
              onChangeText={(v) => update('cuisines', v)}
            />
            <Row gap={spacing.xs} style={{ flexWrap: 'wrap', marginTop: 4 }}>
              {POPULAR_CUISINES.map((c) => {
                const active = form.cuisines.toLowerCase().includes(c.toLowerCase());
                return (
                  <Chip
                    key={c}
                    label={c}
                    active={active}
                    onPress={() => {
                      const list = form.cuisines
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean);
                      if (active) {
                        update('cuisines', list.filter((x) => x.toLowerCase() !== c.toLowerCase()).join(', '));
                      } else {
                        update('cuisines', [...list, c].join(', '));
                      }
                    }}
                  />
                );
              })}
            </Row>
          </View>

          <Row justify="space-between" style={{ alignItems: 'center' }}>
            <View style={{ gap: 2 }}>
              <Text variant="label">Pure Veg Outlet</Text>
              <Text variant="caption" muted>
                Serves 100% vegetarian food only
              </Text>
            </View>
            <Toggle
              value={form.isVegOnly}
              onValueChange={(v) => update('isVegOnly', v)}
              tone="success"
              accessibilityLabel="Pure Veg Outlet"
            />
          </Row>

          <Row gap={spacing.md}>
            <View style={{ flex: 1 }}>
              <Input
                label="Approx cost for two (₹)"
                icon="cash-outline"
                keyboardType="number-pad"
                value={form.costForTwo}
                onChangeText={(v) => update('costForTwo', v)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Avg prep time (mins)"
                icon="timer-outline"
                keyboardType="number-pad"
                value={form.avgPrepMinutes}
                onChangeText={(v) => update('avgPrepMinutes', v)}
              />
            </View>
          </Row>

          <Input
            label="Outlet phone number *"
            icon="call-outline"
            keyboardType="phone-pad"
            placeholder="10-digit mobile"
            value={form.phone}
            onChangeText={(v) => update('phone', v)}
          />

          <Input
            label="Outlet email address"
            icon="mail-outline"
            keyboardType="email-address"
            placeholder="orders@restaurant.com"
            value={form.email}
            onChangeText={(v) => update('email', v)}
          />
        </Card>
      ) : null}

      {/* ── STEP 2: Location ──────────────────────────────────────────────── */}
      {step === 2 ? (
        <Card style={{ gap: spacing.lg }}>
          <Text variant="heading">Location & Service Area</Text>
          <Input
            label="Complete address *"
            placeholder="Shop / Unit number, Building, Street, Landmark"
            value={form.addressLine}
            onChangeText={(v) => update('addressLine', v)}
            multiline
          />

          {pin ? (
            <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
              <DeliveryMap
                center={pin}
                markers={[{ id: 'outlet', kind: 'restaurant', ...pin }]}
                height={200}
                onCenterChanged={setPin}
              />
            </View>
          ) : null}

          <Button
            title={pin ? 'Re-capture GPS Location' : 'Pin My Exact Location'}
            icon="locate"
            kind="secondary"
            onPress={locate}
          />

          {pin ? (
            <Row gap={spacing.sm}>
              <Icon name="checkmark-circle" size={16} color={t.successText} />
              <Text variant="caption" color={t.successText}>
                Coordinates pinned ({pin.lat.toFixed(4)}, {pin.lng.toFixed(4)})
              </Text>
            </Row>
          ) : (
            <Text variant="caption" muted>
              Please capture coordinates while at the kitchen / restaurant outlet.
            </Text>
          )}
        </Card>
      ) : null}

      {/* ── STEP 3: Food Safety & Regulatory (FSSAI, PAN, GST) ─────────────── */}
      {step === 3 ? (
        <Card style={{ gap: spacing.lg }}>
          <Text variant="heading">Food Safety & Compliance</Text>

          <Input
            label="Owner / Applicant Full Name *"
            icon="person-outline"
            placeholder="Full Name as per PAN"
            value={form.ownerName}
            onChangeText={(v) => update('ownerName', v)}
          />

          <Input
            label="Registered Legal Entity Name *"
            icon="business-outline"
            placeholder="Proprietorship, Partnership or Company name"
            value={form.legalEntityName}
            onChangeText={(v) => update('legalEntityName', v)}
          />

          <Divider />

          {/* FSSAI */}
          <View style={{ gap: spacing.sm }}>
            <Row justify="space-between">
              <Text variant="heading" style={{ fontSize: 16 }}>
                FSSAI License
              </Text>
              <Badge label="Mandatory by Law" tone="brand" />
            </Row>
            <Input
              label="14-Digit FSSAI Licence Number *"
              icon="document-text-outline"
              placeholder="e.g. 11223344556677"
              keyboardType="number-pad"
              maxLength={14}
              value={form.fssaiLicense}
              onChangeText={(v) => update('fssaiLicense', v)}
              error={
                form.fssaiLicense && !/^\d{14}$/.test(form.fssaiLicense.trim())
                  ? 'FSSAI licence must be exactly 14 digits'
                  : null
              }
            />

            <Input
              label="FSSAI Expiry Date (YYYY-MM-DD) *"
              icon="calendar-outline"
              placeholder="2027-12-31"
              value={form.fssaiExpiryDate}
              onChangeText={(v) => update('fssaiExpiryDate', v)}
            />

            <Row justify="space-between" style={{ alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">FSSAI Certificate Photo *</Text>
                <Text variant="caption" muted>
                  {form.fssaiDocumentPath ? 'Certificate attached' : 'Clear photo or PDF scan'}
                </Text>
              </View>
              <Button
                title={form.fssaiDocumentPath ? 'Replace Certificate' : 'Upload Certificate'}
                icon={form.fssaiDocumentPath ? 'checkmark-circle' : 'cloud-upload-outline'}
                kind={form.fssaiDocumentPath ? 'secondary' : 'primary'}
                size="sm"
                loading={uploadingDoc === 'fssai'}
                onPress={() => handleUpload('fssai', 'fssaiDocumentPath')}
              />
            </Row>
          </View>

          <Divider />

          {/* Business PAN */}
          <View style={{ gap: spacing.sm }}>
            <Row justify="space-between">
              <Text variant="heading" style={{ fontSize: 16 }}>
                Business PAN
              </Text>
              <Badge label="Mandatory" tone="brand" />
            </Row>
            <Input
              label="10-Character PAN Number *"
              icon="card-outline"
              placeholder="e.g. ABCDE1234F"
              autoCapitalize="characters"
              maxLength={10}
              value={form.panNumber}
              onChangeText={(v) => update('panNumber', v.toUpperCase())}
              error={
                form.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.panNumber.trim())
                  ? 'Invalid PAN format (5 letters, 4 digits, 1 letter)'
                  : null
              }
            />

            <Row justify="space-between" style={{ alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">PAN Card Photo *</Text>
                <Text variant="caption" muted>
                  {form.panDocumentPath ? 'PAN Card attached' : 'Clear photo of PAN Card'}
                </Text>
              </View>
              <Button
                title={form.panDocumentPath ? 'Replace PAN' : 'Upload PAN'}
                icon={form.panDocumentPath ? 'checkmark-circle' : 'cloud-upload-outline'}
                kind={form.panDocumentPath ? 'secondary' : 'primary'}
                size="sm"
                loading={uploadingDoc === 'pan'}
                onPress={() => handleUpload('pan', 'panDocumentPath')}
              />
            </Row>
          </View>

          <Divider />

          {/* GSTIN */}
          <View style={{ gap: spacing.sm }}>
            <Row justify="space-between">
              <Text variant="heading" style={{ fontSize: 16 }}>
                GSTIN Details
              </Text>
              <Toggle
                value={form.isGstExempt}
                onValueChange={(v) => update('isGstExempt', v)}
                tone="brand"
                accessibilityLabel="GST Exempted"
              />
            </Row>
            <Text variant="caption" muted>
              {form.isGstExempt
                ? 'Turnover is under threshold limit (₹20L/₹40L) - GST Exempted'
                : 'Enter your 15-character GSTIN for B2B input tax credit'}
            </Text>

            {!form.isGstExempt ? (
              <>
                <Input
                  label="15-Character GSTIN"
                  icon="receipt-outline"
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  autoCapitalize="characters"
                  maxLength={15}
                  value={form.gstin}
                  onChangeText={(v) => update('gstin', v.toUpperCase())}
                />
                <Row justify="space-between" style={{ alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="label">GST Certificate (Optional)</Text>
                  </View>
                  <Button
                    title={form.gstDocumentPath ? 'Replace GST Doc' : 'Upload GST'}
                    kind="secondary"
                    size="sm"
                    loading={uploadingDoc === 'gst'}
                    onPress={() => handleUpload('gst', 'gstDocumentPath')}
                  />
                </Row>
              </>
            ) : null}
          </View>
        </Card>
      ) : null}

      {/* ── STEP 4: Bank Account & Payouts ─────────────────────────────────── */}
      {step === 4 ? (
        <Card style={{ gap: spacing.lg }}>
          <View style={{ gap: 4 }}>
            <Text variant="heading">Settlement & Bank Details</Text>
            <Text variant="caption" muted>
              Weekly order payouts are transferred directly to this account via RazorpayX.
            </Text>
          </View>

          <Input
            label="Account Beneficiary Name *"
            icon="person-outline"
            placeholder="As per bank passbook / cheque"
            value={form.bankBeneficiaryName}
            onChangeText={(v) => update('bankBeneficiaryName', v)}
          />

          <Input
            label="Bank Name *"
            icon="business-outline"
            placeholder="e.g. HDFC Bank, ICICI Bank, State Bank of India"
            value={form.bankName}
            onChangeText={(v) => update('bankName', v)}
          />

          <Input
            label="Bank Account Number *"
            icon="card-outline"
            keyboardType="number-pad"
            secureTextEntry
            placeholder="Account number"
            value={form.bankAccountNumber}
            onChangeText={(v) => update('bankAccountNumber', v)}
          />

          {!isEditing ? (
            <Input
              label="Confirm Bank Account Number *"
              icon="card-outline"
              keyboardType="number-pad"
              placeholder="Re-enter account number"
              value={form.confirmAccountNumber}
              onChangeText={(v) => update('confirmAccountNumber', v)}
              error={
                form.confirmAccountNumber &&
                form.confirmAccountNumber !== form.bankAccountNumber
                  ? 'Account numbers do not match'
                  : null
              }
            />
          ) : null}

          <Input
            label="Bank IFSC Code *"
            icon="key-outline"
            placeholder="e.g. HDFC0001234"
            autoCapitalize="characters"
            maxLength={11}
            value={form.bankIfsc}
            onChangeText={(v) => update('bankIfsc', v.toUpperCase())}
            error={
              form.bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.bankIfsc.trim())
                ? 'Invalid IFSC format (e.g. SBIN0001234)'
                : null
            }
          />

          <Divider />

          <Row justify="space-between" style={{ alignItems: 'center' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">Cancelled Cheque or Passbook Photo</Text>
              <Text variant="caption" muted>
                {form.bankChequeDocumentPath
                  ? 'Cheque proof attached'
                  : 'Used by finance to verify IFSC and account holder'}
              </Text>
            </View>
            <Button
              title={form.bankChequeDocumentPath ? 'Replace Cheque' : 'Upload Proof'}
              icon={form.bankChequeDocumentPath ? 'checkmark-circle' : 'cloud-upload-outline'}
              kind={form.bankChequeDocumentPath ? 'secondary' : 'primary'}
              size="sm"
              loading={uploadingDoc === 'cheque'}
              onPress={() => handleUpload('cheque', 'bankChequeDocumentPath')}
            />
          </Row>
        </Card>
      ) : null}

      {/* ── STEP 5: Review & Submit ────────────────────────────────────────── */}
      {step === 5 ? (
        <Card style={{ gap: spacing.lg }}>
          <Text variant="heading">Review & Confirm Application</Text>

          <View style={styles.summaryBlock}>
            <Row justify="space-between">
              <Text variant="label" style={{ fontWeight: '700' }}>
                Restaurant & Cuisines
              </Text>
              <TouchableOpacity onPress={() => setStep(1)}>
                <Text variant="caption" color={t.brandText}>
                  Edit
                </Text>
              </TouchableOpacity>
            </Row>
            <Text variant="body">{form.name}</Text>
            <Text variant="caption" muted>
              {form.cuisines} · {form.isVegOnly ? 'Pure Veg' : 'Veg & Non-Veg'}
            </Text>
            <Text variant="caption" muted>
              Phone: {form.phone} · Approx ₹{form.costForTwo} for two
            </Text>
          </View>

          <View style={styles.summaryBlock}>
            <Row justify="space-between">
              <Text variant="label" style={{ fontWeight: '700' }}>
                Outlet Location
              </Text>
              <TouchableOpacity onPress={() => setStep(2)}>
                <Text variant="caption" color={t.brandText}>
                  Edit
                </Text>
              </TouchableOpacity>
            </Row>
            <Text variant="body">{form.addressLine}</Text>
            <Text variant="caption" color={t.successText}>
              ✓ GPS Location Pinned
            </Text>
          </View>

          <View style={styles.summaryBlock}>
            <Row justify="space-between">
              <Text variant="label" style={{ fontWeight: '700' }}>
                Compliance & Documents
              </Text>
              <TouchableOpacity onPress={() => setStep(3)}>
                <Text variant="caption" color={t.brandText}>
                  Edit
                </Text>
              </TouchableOpacity>
            </Row>
            <Text variant="body">
              FSSAI: {form.fssaiLicense} (Exp: {form.fssaiExpiryDate})
            </Text>
            <Text variant="caption" muted>
              Entity: {form.legalEntityName} · PAN: {form.panNumber}
            </Text>
            <Text variant="caption" muted>
              GSTIN: {form.isGstExempt ? 'Exempted' : form.gstin || 'None'}
            </Text>
            <Row gap={spacing.xs} style={{ marginTop: 4 }}>
              <Badge label="FSSAI Attached" tone="success" icon="checkmark-circle" />
              <Badge label="PAN Attached" tone="success" icon="checkmark-circle" />
            </Row>
          </View>

          <View style={styles.summaryBlock}>
            <Row justify="space-between">
              <Text variant="label" style={{ fontWeight: '700' }}>
                Settlement Bank Account
              </Text>
              <TouchableOpacity onPress={() => setStep(4)}>
                <Text variant="caption" color={t.brandText}>
                  Edit
                </Text>
              </TouchableOpacity>
            </Row>
            <Text variant="body">
              {form.bankBeneficiaryName} · {form.bankName}
            </Text>
            <Text variant="caption" muted>
              A/C: ••••{form.bankAccountNumber.slice(-4)} · IFSC: {form.bankIfsc}
            </Text>
            {form.bankChequeDocumentPath ? (
              <Badge label="Cheque Proof Attached" tone="success" icon="checkmark-circle" />
            ) : null}
          </View>

          <View style={[styles.agreement, { backgroundColor: t.surfaceRaised }]}>
            <Icon name="shield-checkmark" size={20} color={t.brandText} />
            <Text variant="caption" muted style={{ flex: 1 }}>
              By submitting, you certify that the FSSAI license, tax registrations, and bank
              information provided are accurate and comply with Food Safety Standards of India.
            </Text>
          </View>
        </Card>
      ) : null}

      <Button
        title="Sign Out"
        kind="ghost"
        icon="log-out-outline"
        onPress={() => void signOut()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepBar: {
    paddingVertical: spacing.xs,
  },
  stepItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  summaryBlock: {
    gap: 2,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  agreement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
});
