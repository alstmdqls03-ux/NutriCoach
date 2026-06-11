import { describe, it, expect } from 'vitest';
import { validateEmail, validateNewPassword, validateCode } from '@/lib/auth/resetValidation';

describe('resetValidation', () => {
  it('validateEmail: null when valid, message when not', () => {
    expect(validateEmail('a@b.com')).toBeNull();
    expect(validateEmail('  a@b.com ')).toBeNull(); // trimmed
    expect(validateEmail('')).toMatch(/입력/);
    expect(validateEmail('nope')).toMatch(/형식/);
  });

  it('validateNewPassword: requires >= 8 chars', () => {
    expect(validateNewPassword('12345678')).toBeNull();
    expect(validateNewPassword('1234567')).toMatch(/8자/);
  });

  it('validateCode: requires exactly 6 digits', () => {
    expect(validateCode('123456')).toBeNull();
    expect(validateCode('12345')).toMatch(/6자리/);
    expect(validateCode('abcdef')).toMatch(/6자리/);
  });
});
