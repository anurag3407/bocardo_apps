import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import type {
  RiderApplyDtoGender,
  RiderApplyDtoVehicleType,
  RiderProfile,
} from '@/core/api/generated/model';
import { ridersApply, ridersResubmit } from '@/core/api/generated/rider/rider';
import { refreshClaims, signOut } from '@/core/auth/auth-actions';
import { useSession } from '@/core/auth/session-store';
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  Input,
  Logo,
  radius,
  Row,
  Screen,
  spacing,
  Text,
  useTheme,
} from '@/ui';
import { DocumentPickerField } from './DocumentPickerField';

const VEHICLES: { key: RiderApplyDtoVehicleType; label: string; emoji: string }[] = [
  { key: 'motorcycle', label: 'Bike', emoji: '🏍️' },
  { key: 'scooter', label: 'Scooter', emoji: '🛵' },
  { key: 'ev', label: 'EV', emoji: '⚡' },
  { key: 'bicycle', label: 'Cycle', emoji: '🚲' },
];

const GENDERS: { key: RiderApplyDtoGender; label: string }[] = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
];

const RELATIONS = ['Parent', 'Spouse', 'Sibling', 'Friend', 'Other'] as const;

interface ApplyScreenProps {
  initialProfile?: RiderProfile;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function ApplyScreen({ initialProfile, onComplete, onCancel }: ApplyScreenProps) {
  const t = useTheme();
  const { session } = useSession();
  const userId = session?.user?.id ?? initialProfile?.id ?? '';

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [fullName, setFullName] = useState(initialProfile?.fullName ?? '');
  const [dob, setDob] = useState(initialProfile?.dob ? initialProfile.dob.slice(0, 10) : '');
  const [gender, setGender] = useState<RiderApplyDtoGender>(
    (initialProfile?.gender as RiderApplyDtoGender) ?? 'male',
  );
  const [currentAddress, setCurrentAddress] = useState(initialProfile?.currentAddress ?? '');
  const [emergencyContactName, setEmergencyContactName] = useState(
    initialProfile?.emergencyContactName ?? '',
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    initialProfile?.emergencyContactPhone ?? '',
  );
  const [emergencyContactRelation, setEmergencyContactRelation] = useState(
    initialProfile?.emergencyContactRelation ?? 'Parent',
  );

  // Vehicle & DL
  const [vehicleType, setVehicleType] = useState<RiderApplyDtoVehicleType>(
    initialProfile?.vehicleType ?? 'motorcycle',
  );
  const [vehicleNumber, setVehicleNumber] = useState(initialProfile?.vehicleNumber ?? '');
  const [rcDocumentPath, setRcDocumentPath] = useState<string | null>(
    initialProfile?.rcDocumentPath ?? null,
  );
  const [licenseNumber, setLicenseNumber] = useState(initialProfile?.licenseNumber ?? '');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState(
    initialProfile?.licenseExpiryDate ? initialProfile.licenseExpiryDate.slice(0, 10) : '',
  );
  const [licenseFrontPath, setLicenseFrontPath] = useState<string | null>(
    initialProfile?.licenseFrontPath ?? null,
  );
  const [licenseBackPath, setLicenseBackPath] = useState<string | null>(
    initialProfile?.licenseBackPath ?? null,
  );

  // KYC Docs
  const [aadhaarNumber, setAadhaarNumber] = useState(initialProfile?.aadhaarNumber ?? '');
  const [aadhaarFrontPath, setAadhaarFrontPath] = useState<string | null>(
    initialProfile?.aadhaarFrontPath ?? null,
  );
  const [aadhaarBackPath, setAadhaarBackPath] = useState<string | null>(
    initialProfile?.aadhaarBackPath ?? null,
  );
  const [panNumber, setPanNumber] = useState(initialProfile?.panNumber ?? '');
  const [panCardPath, setPanCardPath] = useState<string | null>(
    initialProfile?.panCardPath ?? null,
  );

  // Bank Account
  const [bankBeneficiaryName, setBankBeneficiaryName] = useState(
    initialProfile?.bankBeneficiaryName ?? '',
  );
  const [bankName, setBankName] = useState(initialProfile?.bankName ?? '');
  const [bankAccountNumber, setBankAccountNumber] = useState(
    initialProfile?.bankAccountNumber ?? '',
  );
  const [confirmAccountNumber, setConfirmAccountNumber] = useState(
    initialProfile?.bankAccountNumber ?? '',
  );
  const [bankIfsc, setBankIfsc] = useState(initialProfile?.bankIfsc ?? '');
  const [bankChequeDocumentPath, setBankChequeDocumentPath] = useState<string | null>(
    initialProfile?.bankChequeDocumentPath ?? null,
  );

  const [declaration, setDeclaration] = useState(false);

  // Validation helpers
  const validateStep1 = () => {
    if (fullName.trim().length < 2) {
      Alert.alert('Full Name Required', 'Please enter your full legal name as on government ID.');
      return false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) {
      Alert.alert('Invalid Date of Birth', 'Please enter your date of birth in YYYY-MM-DD format (e.g. 1998-05-15).');
      return false;
    }
    const birthDate = new Date(dob.trim());
    const now = new Date();
    let age = now.getFullYear() - birthDate.getFullYear();
    const m = now.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
    if (age < 18) {
      Alert.alert('Age Requirement', 'You must be at least 18 years of age to deliver with Bocardo.');
      return false;
    }
    if (currentAddress.trim().length < 10) {
      Alert.alert('Address Required', 'Please enter your complete current residential address (min 10 characters).');
      return false;
    }
    if (emergencyContactName.trim().length < 2) {
      Alert.alert('Emergency Contact', 'Please provide an emergency contact person name.');
      return false;
    }
    if (!/^[6-9]\d{9}$/.test(emergencyContactPhone.trim())) {
      Alert.alert('Emergency Contact Phone', 'Please enter a valid 10-digit Indian mobile number for emergency contact.');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (vehicleType !== 'bicycle') {
      const cleanVeh = vehicleNumber.replace(/\s+/g, '').toUpperCase();
      if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(cleanVeh)) {
        Alert.alert('Invalid Vehicle Number', 'Please enter a valid registration number (e.g. MH12AB1234 or KA01A1234).');
        return false;
      }
      if (!rcDocumentPath) {
        Alert.alert('Vehicle RC Photo Needed', 'Please upload a photo of your vehicle registration certificate (RC).');
        return false;
      }
      const cleanDl = licenseNumber.replace(/[\s-]+/g, '').toUpperCase();
      if (cleanDl.length < 10 || cleanDl.length > 20) {
        Alert.alert('Invalid Driving Licence', 'Please enter a valid driving licence number.');
        return false;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiryDate.trim())) {
        Alert.alert('Invalid Licence Expiry', 'Please enter your driving licence expiry date in YYYY-MM-DD format.');
        return false;
      }
      if (new Date(licenseExpiryDate.trim()).getTime() <= Date.now()) {
        Alert.alert('Licence Expired', 'Your driving licence must be currently valid.');
        return false;
      }
      if (!licenseFrontPath) {
        Alert.alert('DL Photo Needed', 'Please upload the front photo of your driving licence.');
        return false;
      }
    }
    return true;
  };

  const validateStep3 = () => {
    const cleanAadhaar = aadhaarNumber.replace(/\s+/g, '');
    if (!/^\d{12}$/.test(cleanAadhaar)) {
      Alert.alert('Invalid Aadhaar', 'Please enter a valid 12-digit Aadhaar number.');
      return false;
    }
    if (!aadhaarFrontPath) {
      Alert.alert('Aadhaar Photo Needed', 'Please upload the front photo of your Aadhaar card.');
      return false;
    }
    const cleanPan = panNumber.trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
      Alert.alert('Invalid PAN Number', 'Please enter a valid 10-digit PAN (e.g. ABCDE1234F).');
      return false;
    }
    if (!panCardPath) {
      Alert.alert('PAN Card Photo Needed', 'Please upload a photo of your PAN card.');
      return false;
    }
    return true;
  };

  const validateStep4 = () => {
    if (bankBeneficiaryName.trim().length < 2) {
      Alert.alert('Beneficiary Name', 'Please enter the account holder name exactly as on bank records.');
      return false;
    }
    if (bankName.trim().length < 2) {
      Alert.alert('Bank Name', 'Please enter your bank name (e.g. HDFC Bank, SBI).');
      return false;
    }
    const cleanAcct = bankAccountNumber.trim();
    if (!/^\d{9,18}$/.test(cleanAcct)) {
      Alert.alert('Invalid Bank Account', 'Bank account number must be between 9 and 18 digits.');
      return false;
    }
    if (cleanAcct !== confirmAccountNumber.trim()) {
      Alert.alert('Account Number Mismatch', 'The re-entered bank account number does not match.');
      return false;
    }
    const cleanIfsc = bankIfsc.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      Alert.alert('Invalid IFSC Code', 'Please enter a valid 11-character IFSC code (e.g. HDFC0001234).');
      return false;
    }
    if (!bankChequeDocumentPath) {
      Alert.alert('Bank Proof Required', 'Please upload a photo of your cancelled cheque or passbook for payout verification.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
    else if (step === 3 && validateStep3()) setStep(4);
    else if (step === 4 && validateStep4()) setStep(5);
  };

  const submitApplication = async () => {
    if (!declaration) {
      Alert.alert('Declaration Required', 'Please confirm the statutory declaration to submit your application.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        fullName: fullName.trim(),
        dob: dob.trim(),
        gender,
        currentAddress: currentAddress.trim(),
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
        emergencyContactRelation,
        vehicleType,
        vehicleNumber: vehicleType !== 'bicycle' ? vehicleNumber.replace(/\s+/g, '').toUpperCase() : undefined,
        licenseNumber: vehicleType !== 'bicycle' ? licenseNumber.replace(/[\s-]+/g, '').toUpperCase() : undefined,
        licenseExpiryDate: vehicleType !== 'bicycle' ? licenseExpiryDate.trim() : undefined,
        licenseFrontPath: vehicleType !== 'bicycle' ? (licenseFrontPath ?? undefined) : undefined,
        licenseBackPath: vehicleType !== 'bicycle' ? (licenseBackPath ?? undefined) : undefined,
        rcDocumentPath: vehicleType !== 'bicycle' ? (rcDocumentPath ?? undefined) : undefined,
        aadhaarNumber: aadhaarNumber.replace(/\s+/g, ''),
        aadhaarFrontPath: aadhaarFrontPath ?? undefined,
        aadhaarBackPath: aadhaarBackPath ?? undefined,
        panNumber: panNumber.trim().toUpperCase(),
        panCardPath: panCardPath ?? undefined,
        bankAccountNumber: bankAccountNumber.trim(),
        bankIfsc: bankIfsc.trim().toUpperCase(),
        bankBeneficiaryName: bankBeneficiaryName.trim(),
        bankName: bankName.trim(),
        bankChequeDocumentPath: bankChequeDocumentPath ?? undefined,
      };

      if (initialProfile) {
        await ridersResubmit(payload);
        Alert.alert('Application Updated', 'Your updated application has been submitted for verification.');
        onComplete?.();
      } else {
        await ridersApply(payload);
        await refreshClaims();
        Alert.alert('Application Submitted', 'Your rider onboarding application has been submitted successfully!');
        onComplete?.();
      }
    } catch (e) {
      Alert.alert('Submission Error', errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      scroll
      tone="surface"
      footer={
        step < 5 ? (
          <Row gap={spacing.sm}>
            {step > 1 ? (
              <Button
                title="Back"
                kind="secondary"
                size="lg"
                style={{ flex: 1 }}
                onPress={() => setStep((s) => (s - 1) as any)}
              />
            ) : onCancel ? (
              <Button
                title="Cancel"
                kind="secondary"
                size="lg"
                style={{ flex: 1 }}
                onPress={onCancel}
              />
            ) : null}
            <Button
              title="Continue"
              icon="arrow-forward"
              size="lg"
              style={{ flex: 2 }}
              onPress={handleNext}
            />
          </Row>
        ) : (
          <Row gap={spacing.sm}>
            <Button
              title="Back"
              kind="secondary"
              size="lg"
              style={{ flex: 1 }}
              onPress={() => setStep(4)}
            />
            <Button
              title={initialProfile ? 'Resubmit Application' : 'Submit Application'}
              icon="checkmark-circle"
              size="lg"
              loading={submitting}
              style={{ flex: 2 }}
              onPress={submitApplication}
            />
          </Row>
        )
      }>
      {/* Top Banner & Stepper */}
      <Card style={{ backgroundColor: t.sky, gap: spacing.md }}>
        <Row justify="space-between" style={{ alignItems: 'center' }}>
          <Logo size={40} wordmark tag="Delivery Partner" />
          {!initialProfile ? (
            <Button
              title="Sign out"
              kind="ghost"
              size="sm"
              icon="log-out-outline"
              onPress={() => void signOut()}
            />
          ) : null}
        </Row>
        <View style={{ gap: 4 }}>
          <Text variant="title" color={t.ink}>
            {initialProfile ? 'Update Rider Application' : 'Deliver with Bocardo'}
          </Text>
          <Text variant="caption" color={t.ink} style={{ opacity: 0.8 }}>
            Earn weekly with guaranteed payouts, flexible hours, and accidental insurance coverage.
          </Text>
        </View>

        {/* Step indicator pills */}
        <Row gap={spacing.xs}>
          {[1, 2, 3, 4, 5].map((s) => (
            <View
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: step >= s ? t.brand : 'rgba(0,0,0,0.15)',
              }}
            />
          ))}
        </Row>
        <Text variant="caption" color={t.ink} style={{ fontWeight: '600' }}>
          Step {step} of 5:{' '}
          {step === 1
            ? 'Personal & Emergency Details'
            : step === 2
              ? 'Vehicle & Driving Licence'
              : step === 3
                ? 'Identity & KYC Documents'
                : step === 4
                  ? 'Bank Account & Payouts'
                  : 'Review & Declaration'}
        </Text>
      </Card>

      {/* STEP 1: Personal & Emergency Contact */}
      {step === 1 && (
        <Card style={{ gap: spacing.md }}>
          <Text variant="title" style={{ fontSize: 18 }}>Personal Information</Text>
          <Input
            label="Full Legal Name"
            placeholder="As printed on government ID"
            icon="person-outline"
            value={fullName}
            onChangeText={setFullName}
          />
          <Input
            label="Date of Birth (YYYY-MM-DD)"
            placeholder="1998-05-15"
            icon="calendar-outline"
            value={dob}
            onChangeText={setDob}
          />

          <View style={{ gap: spacing.xs }}>
            <Text variant="label" muted>Gender</Text>
            <Row gap={spacing.sm}>
              {GENDERS.map((g) => {
                const active = gender === g.key;
                return (
                  <Pressable
                    key={g.key}
                    onPress={() => setGender(g.key)}
                    style={[
                      styles.choicePill,
                      {
                        backgroundColor: active ? t.brandSoft : t.surfaceRaised,
                        borderColor: active ? t.brand : t.border,
                      },
                    ]}>
                    <Text variant="label" color={active ? t.brandText : t.text}>
                      {g.label}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </View>

          <Input
            label="Current Residential Address"
            placeholder="House/Flat No., Street, Area, City, Pincode"
            icon="location-outline"
            value={currentAddress}
            onChangeText={setCurrentAddress}
          />

          <Divider />

          <Text variant="title" style={{ fontSize: 18 }}>Emergency Contact</Text>
          <Text variant="caption" muted>
            Mandatory for rider safety. Contacted only in case of on-road medical or emergency events.
          </Text>

          <Input
            label="Emergency Contact Name"
            placeholder="Parent, Spouse, or Relative"
            icon="people-outline"
            value={emergencyContactName}
            onChangeText={setEmergencyContactName}
          />

          <View style={{ gap: spacing.xs }}>
            <Text variant="label" muted>Relationship</Text>
            <Row gap={spacing.xs} style={{ flexWrap: 'wrap' }}>
              {RELATIONS.map((r) => {
                const active = emergencyContactRelation === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setEmergencyContactRelation(r)}
                    style={[
                      styles.choicePill,
                      {
                        backgroundColor: active ? t.brandSoft : t.surfaceRaised,
                        borderColor: active ? t.brand : t.border,
                        paddingHorizontal: 12,
                      },
                    ]}>
                    <Text variant="caption" color={active ? t.brandText : t.text} style={{ fontWeight: '600' }}>
                      {r}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </View>

          <Input
            label="Emergency Contact Phone"
            placeholder="10-digit mobile number"
            icon="call-outline"
            keyboardType="phone-pad"
            maxLength={10}
            value={emergencyContactPhone}
            onChangeText={setEmergencyContactPhone}
          />
        </Card>
      )}

      {/* STEP 2: Vehicle & Driving Licence */}
      {step === 2 && (
        <Card style={{ gap: spacing.md }}>
          <Text variant="title" style={{ fontSize: 18 }}>Vehicle Information</Text>

          <View style={{ gap: spacing.sm }}>
            <Text variant="label" muted>Select Vehicle Type</Text>
            <Row gap={spacing.sm}>
              {VEHICLES.map((v) => {
                const active = vehicleType === v.key;
                return (
                  <Pressable
                    key={v.key}
                    onPress={() => setVehicleType(v.key)}
                    style={[
                      styles.vehicleCard,
                      {
                        borderColor: active ? t.brand : t.border,
                        backgroundColor: active ? t.brandSoft : t.surfaceRaised,
                      },
                    ]}>
                    <Text style={{ fontSize: 26 }}>{v.emoji}</Text>
                    <Text variant="label" color={active ? t.brandText : t.text}>
                      {v.label}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </View>

          {vehicleType !== 'bicycle' ? (
            <>
              <Input
                label="Vehicle Registration Number"
                placeholder="MH 12 AB 1234"
                icon="car-outline"
                autoCapitalize="characters"
                value={vehicleNumber}
                onChangeText={setVehicleNumber}
              />

              <DocumentPickerField
                label="Vehicle RC Photo"
                hint="Upload clear photo of Registration Certificate"
                docType="rc"
                userId={userId}
                currentPath={rcDocumentPath}
                onUploaded={setRcDocumentPath}
                required
              />

              <Divider />

              <Text variant="title" style={{ fontSize: 18 }}>Driving Licence</Text>
              <Input
                label="Driving Licence Number"
                placeholder="e.g. DL-1420110012345"
                icon="card-outline"
                autoCapitalize="characters"
                value={licenseNumber}
                onChangeText={setLicenseNumber}
              />
              <Input
                label="Licence Expiry Date (YYYY-MM-DD)"
                placeholder="2030-12-31"
                icon="calendar-outline"
                value={licenseExpiryDate}
                onChangeText={setLicenseExpiryDate}
              />

              <DocumentPickerField
                label="Licence Front Photo"
                hint="Clear front photo showing name & expiry"
                docType="license_front"
                userId={userId}
                currentPath={licenseFrontPath}
                onUploaded={setLicenseFrontPath}
                required
              />

              <DocumentPickerField
                label="Licence Back Photo"
                hint="Clear back photo showing address"
                docType="license_back"
                userId={userId}
                currentPath={licenseBackPath}
                onUploaded={setLicenseBackPath}
              />
            </>
          ) : (
            <Card style={{ backgroundColor: t.surfaceRaised, gap: spacing.xs }}>
              <Row gap={spacing.xs} style={{ alignItems: 'center' }}>
                <Icon name="information-circle" size={18} color={t.brandText} />
                <Text variant="label" style={{ fontWeight: '600' }}>Bicycle Delivery</Text>
              </Row>
              <Text variant="caption" muted>
                Driving licence and motor vehicle RC are exempt for bicycle partners. Short-range deliveries (&lt; 3 km) will be prioritized.
              </Text>
            </Card>
          )}
        </Card>
      )}

      {/* STEP 3: Identity & KYC Documents */}
      {step === 3 && (
        <Card style={{ gap: spacing.md }}>
          <Text variant="title" style={{ fontSize: 18 }}>Government KYC Documents</Text>
          <Text variant="caption" muted>
            Required under Indian regulatory guidelines for on-demand fleet verification.
          </Text>

          <Input
            label="Aadhaar Number (12 Digits)"
            placeholder="1234 5678 9012"
            icon="finger-print-outline"
            keyboardType="number-pad"
            maxLength={12}
            value={aadhaarNumber}
            onChangeText={setAadhaarNumber}
          />

          <DocumentPickerField
            label="Aadhaar Card Front Photo"
            hint="Front photo showing photo and Aadhaar number"
            docType="aadhaar_front"
            userId={userId}
            currentPath={aadhaarFrontPath}
            onUploaded={setAadhaarFrontPath}
            required
          />

          <DocumentPickerField
            label="Aadhaar Card Back Photo"
            hint="Back photo showing residential address"
            docType="aadhaar_back"
            userId={userId}
            currentPath={aadhaarBackPath}
            onUploaded={setAadhaarBackPath}
          />

          <Divider />

          <Input
            label="PAN Card Number"
            placeholder="ABCDE1234F"
            icon="document-text-outline"
            autoCapitalize="characters"
            maxLength={10}
            value={panNumber}
            onChangeText={setPanNumber}
          />

          <DocumentPickerField
            label="PAN Card Photo"
            hint="Clear scan or photo of original PAN card"
            docType="pan"
            userId={userId}
            currentPath={panCardPath}
            onUploaded={setPanCardPath}
            required
          />
        </Card>
      )}

      {/* STEP 4: Bank Account & Payouts */}
      {step === 4 && (
        <Card style={{ gap: spacing.md }}>
          <Text variant="title" style={{ fontSize: 18 }}>Bank Account Details</Text>
          <Text variant="caption" muted>
            Weekly delivery earnings, incentives, and tips will be deposited directly to this account every Wednesday.
          </Text>

          <Input
            label="Account Holder Name"
            placeholder="As on bank records / passbook"
            icon="person-outline"
            value={bankBeneficiaryName}
            onChangeText={setBankBeneficiaryName}
          />

          <Input
            label="Bank Name"
            placeholder="e.g. HDFC Bank, SBI, ICICI"
            icon="business-outline"
            value={bankName}
            onChangeText={setBankName}
          />

          <Input
            label="Bank Account Number"
            placeholder="9 to 18 digits"
            icon="card-outline"
            keyboardType="number-pad"
            secureTextEntry
            value={bankAccountNumber}
            onChangeText={setBankAccountNumber}
          />

          <Input
            label="Re-enter Bank Account Number"
            placeholder="Confirm bank account number"
            icon="card-outline"
            keyboardType="number-pad"
            value={confirmAccountNumber}
            onChangeText={setConfirmAccountNumber}
          />

          <Input
            label="IFSC Code"
            placeholder="e.g. HDFC0001234"
            icon="barcode-outline"
            autoCapitalize="characters"
            maxLength={11}
            value={bankIfsc}
            onChangeText={setBankIfsc}
          />

          <DocumentPickerField
            label="Cancelled Cheque or Bank Passbook"
            hint="Photo showing your name, account number, and IFSC"
            docType="cheque"
            userId={userId}
            currentPath={bankChequeDocumentPath}
            onUploaded={setBankChequeDocumentPath}
            required
          />
        </Card>
      )}

      {/* STEP 5: Review & Declaration */}
      {step === 5 && (
        <Card style={{ gap: spacing.md }}>
          <Text variant="title" style={{ fontSize: 18 }}>Review Application</Text>

          <Card style={{ backgroundColor: t.surfaceRaised, gap: spacing.sm }}>
            <Row justify="space-between" style={{ alignItems: 'center' }}>
              <Text variant="label" muted>PERSONAL & EMERGENCY</Text>
              <Pressable onPress={() => setStep(1)}>
                <Text variant="caption" color={t.brandText} style={{ fontWeight: '700' }}>Edit</Text>
              </Pressable>
            </Row>
            <Text style={{ fontWeight: '600' }}>{fullName} ({gender.toUpperCase()})</Text>
            <Text variant="caption" muted>DOB: {dob}</Text>
            <Text variant="caption" muted>Emergency: {emergencyContactName} ({emergencyContactRelation}) - {emergencyContactPhone}</Text>
            <Text variant="caption" muted>Address: {currentAddress}</Text>
          </Card>

          <Card style={{ backgroundColor: t.surfaceRaised, gap: spacing.sm }}>
            <Row justify="space-between" style={{ alignItems: 'center' }}>
              <Text variant="label" muted>VEHICLE & LICENCE</Text>
              <Pressable onPress={() => setStep(2)}>
                <Text variant="caption" color={t.brandText} style={{ fontWeight: '700' }}>Edit</Text>
              </Pressable>
            </Row>
            <Text style={{ fontWeight: '600', textTransform: 'capitalize' }}>Vehicle: {vehicleType}</Text>
            {vehicleType !== 'bicycle' ? (
              <>
                <Text variant="caption" muted>Number: {vehicleNumber}</Text>
                <Text variant="caption" muted>DL: {licenseNumber} (Exp: {licenseExpiryDate})</Text>
              </>
            ) : null}
          </Card>

          <Card style={{ backgroundColor: t.surfaceRaised, gap: spacing.sm }}>
            <Row justify="space-between" style={{ alignItems: 'center' }}>
              <Text variant="label" muted>GOVERNMENT KYC</Text>
              <Pressable onPress={() => setStep(3)}>
                <Text variant="caption" color={t.brandText} style={{ fontWeight: '700' }}>Edit</Text>
              </Pressable>
            </Row>
            <Text variant="caption" muted>Aadhaar: •••• •••• {aadhaarNumber.slice(-4)}</Text>
            <Text variant="caption" muted>PAN: {panNumber.toUpperCase()}</Text>
          </Card>

          <Card style={{ backgroundColor: t.surfaceRaised, gap: spacing.sm }}>
            <Row justify="space-between" style={{ alignItems: 'center' }}>
              <Text variant="label" muted>WEEKLY PAYOUT BANK</Text>
              <Pressable onPress={() => setStep(4)}>
                <Text variant="caption" color={t.brandText} style={{ fontWeight: '700' }}>Edit</Text>
              </Pressable>
            </Row>
            <Text style={{ fontWeight: '600' }}>{bankName}</Text>
            <Text variant="caption" muted>Account: •••• •••• {bankAccountNumber.slice(-4)}</Text>
            <Text variant="caption" muted>IFSC: {bankIfsc.toUpperCase()} | Beneficiary: {bankBeneficiaryName}</Text>
          </Card>

          <Divider />

          {/* Statutory Declaration */}
          <Pressable
            onPress={() => setDeclaration((d) => !d)}
            style={[styles.declarationRow, { borderColor: declaration ? t.brand : t.border }]}>
            <Icon
              name={declaration ? 'checkbox' : 'square-outline'}
              size={22}
              color={declaration ? t.brand : t.textMuted}
            />
            <Text variant="caption" style={{ flex: 1, lineHeight: 18 }}>
              I hereby declare that all information and KYC documents submitted are authentic, valid, and belong to me. I understand that false statements or expired documents will lead to disqualification or account termination under the Motor Vehicles Act and Bocardo Fleet Terms.
            </Text>
          </Pressable>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  choicePill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  vehicleCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  declarationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
