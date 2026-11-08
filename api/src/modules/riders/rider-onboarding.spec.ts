import {
  AadhaarRegex,
  DlRegex,
  IfscRegex,
  PanRegex,
  RiderApplyDto,
  RiderResubmitDto,
  VehicleNumberRegex,
} from './riders.dto';

describe('Rider Onboarding Compliance & Validation (Indian Fleet Standards)', () => {
  describe('Regex Pattern Validators', () => {
    it('validates 12-digit Indian Aadhaar numbers', () => {
      expect(AadhaarRegex.test('123456789012')).toBe(true);
      expect(AadhaarRegex.test('987654321098')).toBe(true);
      // Rejects incorrect length or non-digits
      expect(AadhaarRegex.test('12345')).toBe(false);
      expect(AadhaarRegex.test('1234567890123')).toBe(false);
      expect(AadhaarRegex.test('12345678901A')).toBe(false);
      expect(AadhaarRegex.test('')).toBe(false);
    });

    it('validates 10-character Indian PAN format', () => {
      expect(PanRegex.test('ABCDE1234F')).toBe(true);
      expect(PanRegex.test('BKZPM8765Q')).toBe(true);
      // Rejects lowercase, wrong digit counts, invalid length
      expect(PanRegex.test('abcde1234f')).toBe(false);
      expect(PanRegex.test('ABCD12345F')).toBe(false);
      expect(PanRegex.test('ABCDE12345')).toBe(false);
      expect(PanRegex.test('12345ABCDE')).toBe(false);
    });

    it('validates 11-character Indian Bank IFSC format', () => {
      expect(IfscRegex.test('HDFC0001234')).toBe(true);
      expect(IfscRegex.test('SBIN0000456')).toBe(true);
      expect(IfscRegex.test('ICIC0000999')).toBe(true);
      // 5th character must be zero
      expect(IfscRegex.test('HDFC1001234')).toBe(false);
      // Must be 11 characters
      expect(IfscRegex.test('HDFC000123')).toBe(false);
      expect(IfscRegex.test('HDFC00012345')).toBe(false);
    });

    it('validates Indian Motor Vehicle Registration Numbers', () => {
      expect(VehicleNumberRegex.test('MH12AB1234')).toBe(true);
      expect(VehicleNumberRegex.test('KA01A1234')).toBe(true);
      expect(VehicleNumberRegex.test('DL1CAB9999')).toBe(true);
      expect(VehicleNumberRegex.test('UP321234')).toBe(true);
      // Rejects invalid strings
      expect(VehicleNumberRegex.test('1234')).toBe(false);
      expect(VehicleNumberRegex.test('M12AB1234')).toBe(false);
      expect(VehicleNumberRegex.test('INVALID_VEHICLE')).toBe(false);
    });

    it('validates Indian Driving Licence numbers', () => {
      expect(DlRegex.test('DL1420110012345')).toBe(true);
      expect(DlRegex.test('MH1420180004567')).toBe(true);
      expect(DlRegex.test('KA0120201234567')).toBe(true);
      // Rejects too short or too long
      expect(DlRegex.test('DL123')).toBe(false);
      expect(DlRegex.test('DL142011001234567890123')).toBe(false);
    });
  });

  describe('RiderApplyDto schema validation', () => {
    const validMotorcyclePayload = {
      fullName: 'Rahul Sharma',
      dob: '1998-05-15',
      gender: 'male',
      currentAddress: 'Flat 402, Green Glen Layout, Bellandur, Bengaluru 560103',
      emergencyContactName: 'Sunita Sharma',
      emergencyContactPhone: '9876543210',
      emergencyContactRelation: 'Mother',
      vehicleType: 'motorcycle',
      vehicleNumber: 'KA01AB1234',
      licenseNumber: 'DL1420110012345',
      licenseExpiryDate: '2032-12-31',
      licenseFrontPath: 'users/123/dl_front.jpg',
      rcDocumentPath: 'users/123/rc_doc.jpg',
      aadhaarNumber: '123456789012',
      aadhaarFrontPath: 'users/123/aadhaar_front.jpg',
      panNumber: 'ABCDE1234F',
      panCardPath: 'users/123/pan_card.jpg',
      bankAccountNumber: '123456789012',
      bankIfsc: 'HDFC0001234',
      bankBeneficiaryName: 'Rahul Sharma',
      bankName: 'HDFC Bank',
      bankChequeDocumentPath: 'users/123/cheque.jpg',
    };

    it('successfully parses and validates complete motorcycle rider onboarding payload', () => {
      const parsed = RiderApplyDto.schema.safeParse(validMotorcyclePayload);
      expect(parsed.success).toBe(true);
    });

    it('permits bicycle rider without DL and vehicle number', () => {
      const bicyclePayload = {
        ...validMotorcyclePayload,
        vehicleType: 'bicycle',
        vehicleNumber: undefined,
        licenseNumber: undefined,
        licenseExpiryDate: undefined,
        licenseFrontPath: undefined,
        rcDocumentPath: undefined,
      };
      const parsed = RiderApplyDto.schema.safeParse(bicyclePayload);
      expect(parsed.success).toBe(true);
    });

    it('rejects motorcycle rider when vehicle number is missing', () => {
      const invalid = { ...validMotorcyclePayload, vehicleNumber: undefined };
      const parsed = RiderApplyDto.schema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('rejects motorcycle rider when driving licence is missing', () => {
      const invalid = { ...validMotorcyclePayload, licenseNumber: undefined };
      const parsed = RiderApplyDto.schema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid Aadhaar number (less than 12 digits)', () => {
      const invalid = { ...validMotorcyclePayload, aadhaarNumber: '12345' };
      const parsed = RiderApplyDto.schema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid PAN format', () => {
      const invalid = { ...validMotorcyclePayload, panNumber: 'INVALID_PAN' };
      const parsed = RiderApplyDto.schema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid IFSC code (wrong 5th char)', () => {
      const invalid = { ...validMotorcyclePayload, bankIfsc: 'HDFC9001234' };
      const parsed = RiderApplyDto.schema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid emergency contact mobile number', () => {
      const invalid = { ...validMotorcyclePayload, emergencyContactPhone: '1234' };
      const parsed = RiderApplyDto.schema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });

  describe('RiderResubmitDto schema validation', () => {
    it('allows partial update of rejected fields (e.g. updated DL & Aadhaar)', () => {
      const resubmitPayload = {
        licenseNumber: 'DL1420110099999',
        licenseFrontPath: 'users/123/dl_front_new.jpg',
        aadhaarNumber: '987654321012',
        aadhaarFrontPath: 'users/123/aadhaar_new.jpg',
      };
      const parsed = RiderResubmitDto.schema.safeParse(resubmitPayload);
      expect(parsed.success).toBe(true);
    });

    it('enforces regex on partial updates', () => {
      const invalidResubmit = {
        bankIfsc: 'INVALID_IFSC',
      };
      const parsed = RiderResubmitDto.schema.safeParse(invalidResubmit);
      expect(parsed.success).toBe(false);
    });
  });
});
