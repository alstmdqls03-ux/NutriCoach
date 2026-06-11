// Pure, dependency-free validation for the password-reset flow so the rules are
// unit-testable without the Supabase SDK. Each function returns a Korean error
// message string, or null when the input is acceptable.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const v = email.trim();
  if (!v) return '이메일을 입력해주세요.';
  if (!EMAIL_RE.test(v)) return '올바른 이메일 형식이 아니에요.';
  return null;
}

export function validateNewPassword(pw: string): string | null {
  if (pw.length < 8) return '비밀번호는 8자 이상이어야 해요.';
  return null;
}

export function validateCode(code: string): string | null {
  if (!/^\d{6,8}$/.test(code.trim())) return '코드를 정확히 입력해주세요.';
  return null;
}
