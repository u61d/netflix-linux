const ValidationService = require('../../../src/main/utils/validation');
const { VALIDATION_SCHEMAS } = require('../../../src/config/schemas');

describe('ValidationService', () => {
  let validator;

  beforeEach(() => {
    validator = new ValidationService();
  });

  describe('validate', () => {
    it('should validate boolean types correctly', () => {
      const result = validator.validate('discordEnabled', true);
      expect(result.valid).toBe(true);
    });

    it('should reject wrong types', () => {
      const result = validator.validate('discordEnabled', 'true');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Expected boolean');
    });

    it('should validate number ranges', () => {
      const result = validator.validate('playbackSpeed', 0.5);
      expect(result.valid).toBe(true);
    });

    it('should reject numbers below minimum', () => {
      const result = validator.validate('playbackSpeed', 0.1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 0.25');
    });

    it('should reject numbers above maximum', () => {
      const result = validator.validate('playbackSpeed', 10);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at most 4');
    });

    it('should validate enum values', () => {
      const validResult = validator.validate('screenshotFormat', 'png');
      expect(validResult.valid).toBe(true);

      const invalidResult = validator.validate('screenshotFormat', 'bmp');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain('Invalid value');
    });

    it('should return valid for unknown keys', () => {
      const result = validator.validate('unknownKey', 'anything');
      expect(result.valid).toBe(true);
    });

    it('should validate reminderInterval range', () => {
      const validResult = validator.validate('reminderInterval', 60);
      expect(validResult.valid).toBe(true);

      const tooLowResult = validator.validate('reminderInterval', 2);
      expect(tooLowResult.valid).toBe(false);

      const tooHighResult = validator.validate('reminderInterval', 300);
      expect(tooHighResult.valid).toBe(false);
    });

    it('should validate screenshotQuality range', () => {
      const validResult = validator.validate('screenshotQuality', 85);
      expect(validResult.valid).toBe(true);

      const invalidResult = validator.validate('screenshotQuality', 0);
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      const result = validator.sanitizeString('  hello  ');
      expect(result).toBe('hello');
    });

    it('should remove dangerous characters', () => {
      const result = validator.sanitizeString('<script>alert("xss")</script>');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
      expect(result).not.toContain("'");
    });

    it('should return non-strings unchanged', () => {
      expect(validator.sanitizeString(123)).toBe(123);
      expect(validator.sanitizeString(null)).toBe(null);
      expect(validator.sanitizeString(undefined)).toBe(undefined);
    });

    it('should handle complex attack strings', () => {
      const attacks = [
        '<img src=x onerror="alert(1)">',
        "'; DROP TABLE users; --",
        '../../../etc/passwd',
      ];

      attacks.forEach(attack => {
        const result = validator.sanitizeString(attack);
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
        expect(result).not.toContain('"');
        expect(result).not.toContain("'");
      });
    });
  });
});