import {
  FssaiRegex,
  GstinRegex,
  IfscRegex,
  PanRegex,
  RestaurantApplyDto,
  RestaurantResubmitDto,
} from './partner.dto';

describe('Restaurant Onboarding Compliance & Validation (Swiggy / Zomato Standards)', () => {
  describe('Regex Pattern Validators', () => {
    it('validates 14-digit Indian FSSAI licence numbers', () => {
      expect(FssaiRegex.test('11223344556677')).toBe(true);
      expect(FssaiRegex.test('12345678901234')).toBe(true);
      // Rejects shorter, longer, or alphanumeric
      expect(FssaiRegex.test('12345')).toBe(false);
      expect(FssaiRegex.test('123456789012345')).toBe(false);
      expect(FssaiRegex.test('1122334455667A')).toBe(false);
      expect(FssaiRegex.test('')).toBe(false);
    });

    it('validates 10-character Indian Business PAN format', () => {
      expect(PanRegex.test('ABCDE1234F')).toBe(true);
      expect(PanRegex.test('AABCB1234G')).toBe(true);
      // Rejects lowercase, wrong digit counts, invalid length
      expect(PanRegex.test('abcde1234f')).toBe(false);
      expect(PanRegex.test('ABCD12345F')).toBe(false);
      expect(PanRegex.test('ABCDE12345')).toBe(false);
      expect(PanRegex.test('12345ABCDE')).toBe(false);
    });

    it('validates 15-character GSTIN format', () => {
      expect(GstinRegex.test('29ABCDE1234F1Z5')).toBe(true);
      expect(GstinRegex.test('07AAAAA0000A1Z5')).toBe(true);
      // Rejects invalid formats
      expect(GstinRegex.test('29ABCDE1234F1Z')).toBe(false);
      expect(GstinRegex.test('29abcde1234f1z5')).toBe(false);
      expect(GstinRegex.test('INVALID_GST')).toBe(false);
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
  });

  describe('RestaurantApplyDto schema validation', () => {
    const validPayload = {
      name: 'Spice Symphony',
      description: 'Authentic Mughlai and Dum Biryani',
      cuisines: ['North Indian', 'Biryani'],
      phone: '+919876543210',
      email: 'owner@spicesymphony.com',
      addressLine: '12th Main, 4th Block, Koramangala, Bengaluru',
      lat: 12.9352,
      lng: 77.6245,
      ownerName: 'Rajesh Kumar',
      ownerPhone: '+919876543210',
      ownerEmail: 'rajesh@spicesymphony.com',
      legalEntityName: 'Spice Symphony Hospitality LLP',
      fssaiLicense: '11223344556677',
      fssaiExpiryDate: '2028-12-31',
      fssaiDocumentPath: 'users/123/fssai_cert.jpg',
      panNumber: 'ABCDE1234F',
      panDocumentPath: 'users/123/pan_card.jpg',
      gstin: '29ABCDE1234F1Z5',
      bankAccountNumber: '123456789012',
      bankIfsc: 'HDFC0001234',
      bankBeneficiaryName: 'Spice Symphony Hospitality LLP',
      bankName: 'HDFC Bank',
      costForTwoPaise: 50000,
      isVegOnly: false,
      avgPrepMinutes: 25,
    };

    it('successfully parses and validates complete onboarding payload', () => {
      const parsed = RestaurantApplyDto.schema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
    });

    it('rejects if FSSAI license is not 14 digits', () => {
      const invalid = { ...validPayload, fssaiLicense: '12345' };
      const parsed = RestaurantApplyDto.schema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('rejects if FSSAI certificate document path is missing', () => {
      const invalid = { ...validPayload, fssaiDocumentPath: '' };
      const parsed = RestaurantApplyDto.schema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('rejects if PAN number format is invalid', () => {
      const invalid = { ...validPayload, panNumber: 'INVALID_PAN' };
      const parsed = RestaurantApplyDto.schema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('rejects if IFSC format is invalid', () => {
      const invalid = { ...validPayload, bankIfsc: 'WRONG_IFSC' };
      const parsed = RestaurantApplyDto.schema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('rejects if coordinates or address are missing', () => {
      const noAddress = { ...validPayload, addressLine: '' };
      expect(RestaurantApplyDto.schema.safeParse(noAddress).success).toBe(false);
    });
  });

  describe('RestaurantResubmitDto schema validation', () => {
    it('allows partial updates during correction and resubmission', () => {
      const resubmitData = {
        fssaiLicense: '99887766554433',
        fssaiExpiryDate: '2029-01-01',
        fssaiDocumentPath: 'users/123/fssai_renewed.jpg',
      };
      const parsed = RestaurantResubmitDto.schema.safeParse(resubmitData);
      expect(parsed.success).toBe(true);
    });
  });
});
