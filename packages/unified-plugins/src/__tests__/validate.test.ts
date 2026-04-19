// Tests for validation stage

import { describe, it, expect } from 'vitest';
import { validate as validateSchema } from '../schema';

describe('validateSchema', () => {
  it('should validate a minimal manifest', () => {
    const manifest = {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'A test plugin',
      author: 'Test Author',
      license: 'MIT',
    };

    const result = validateSchema(manifest);
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should reject manifest missing required fields', () => {
    const manifest = {
      name: 'test-plugin',
      version: '1.0.0',
    };

    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('description'))).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('author'))).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('license'))).toBe(true);
  });

  it('should reject invalid name pattern', () => {
    const manifest = {
      name: 'Test_Plugin!',
      version: '1.0.0',
      description: 'Test',
      author: 'Test',
      license: 'MIT',
    };

    const result = validateSchema(manifest);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('pattern'))).toBe(true);
  });

  it('should accept author as object', () => {
    const manifest = {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'Test',
      author: { name: 'Test Author', email: 'test@example.com' },
      license: 'MIT',
    };

    const result = validateSchema(manifest);
    expect(result.valid).toBe(true);
  });
});
