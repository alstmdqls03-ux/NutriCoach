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

  it('validateCode: accepts 6-8 digits, rejects others', () => {
    expect(validateCode('123456')).toBeNull();
    expect(validateCode('12345678')).toBeNull();
    expect(validateCode('12345')).toMatch(/코드/);
    expect(validateCode('abcdef')).toMatch(/코드/);
  });
});
