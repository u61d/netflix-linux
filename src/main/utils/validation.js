const { VALIDATION_SCHEMAS } = require('../../config/schemas');

class ValidationService {
  validate(key, value) {
    const schema = VALIDATION_SCHEMAS[key];

    if (!schema) {
      return { valid: true };
    }

    if (schema.type && typeof value !== schema.type) {
      return {
        valid: false,
        error: `Expected ${schema.type}, got ${typeof value}`,
      };
    }

    if (schema.type === 'number') {
      if (typeof schema.min === 'number' && value < schema.min) {
        return { valid: false, error: `Value must be at least ${schema.min}` };
      }
      if (typeof schema.max === 'number' && value > schema.max) {
        return { valid: false, error: `Value must be at most ${schema.max}` };
      }
    }

    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      return {
        valid: false,
        error: `Invalid value. Allowed: ${schema.enum.join(', ')}`,
      };
    }

    if (schema.pattern && !schema.pattern.test(value)) {
      return { valid: false, error: schema.patternError || 'Invalid format' };
    }

    return { valid: true };
  }

  sanitizeString(input) {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>'"]/g, '');
  }
}

module.exports = ValidationService;
