# Password Reset (in-app OTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "forgot password" flow to the existing email+password auth using an in-app 6-digit OTP (no email-link handoff), so it works cleanly inside a WebView.

**Architecture:** A pure validation module (`resetValidation`) is unit-tested. A new client route `/reset` runs a 2-step state machine (email → code+new-password) calling Supabase `resetPasswordForEmail` → `verifyOtp({type:'recovery'})` → `updateUser({password})`, reusing the synchronous `useRef` double-submit guard from `Chat.tsx`. The login page links to it. Session handling is unchanged (`@supabase/ssr` cookies + middleware).

**Tech Stack:** Next.js 14 App Router, TypeScript, `@supabase/ssr` / `@supabase/supabase-js` v2, vitest. Working in worktree `.claude/worktrees/password-reset-otp` on branch `worktree-password-reset-otp`.

**Per-task git policy:** every task ends by committing AND pushing the branch. First push uses `-u`.

---

### Task 1: Pure validation helper

**Files:**
- Create: `src/lib/auth/resetValidation.ts`
- Test: `tests/auth/resetValidation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth/resetValidation.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth/resetValidation.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth/resetValidation`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/auth/resetValidation.ts
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
  if (!/^\d{6}$/.test(code.trim())) return '6자리 코드를 정확히 입력해주세요.';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth/resetValidation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/auth/resetValidation.ts tests/auth/resetValidation.test.ts
git commit -m "feat(auth): add pure password-reset input validation + tests"
git push -u origin worktree-password-reset-otp
```

---

### Task 2: `/reset` page (2-step OTP state machine)

**Files:**
- Create: `src/app/reset/page.tsx`

Note: this is a client component whose core async logic is Supabase SDK calls,
verified live in Task 4. The unit-testable rules live in `resetValidation` (Task 1).

- [ ] **Step 1: Create the page**

```tsx
// src/app/reset/page.tsx
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { validateEmail, validateNewPassword, validateCode } from '@/lib/auth/resetValidation';

export default function ResetPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // Synchronous re-entrancy guard (same pattern as Chat.tsx) so a double-tap
  // can't fire two requests before React re-renders.
  const sendingRef = useRef(false);

  async function requestCode() {
    if (sendingRef.current) return;
    const err = validateEmail(email);
    if (err) { setMsg(err); return; }
    sendingRef.current = true; setBusy(true); setMsg('');
    try {
      // Same response whether or not the email exists -> no user enumeration.
      await supabaseBrowser().auth.resetPasswordForEmail(email.trim());
      setStep('code');
      setMsg('코드를 메일로 보냈어요. 메일함을 확인해주세요.');
    } catch {
      setMsg('잠시 문제가 생겼어요. 다시 시도해주세요.');
    } finally { setBusy(false); sendingRef.current = false; }
  }

  async function confirmReset() {
    if (sendingRef.current) return;
    const e1 = validateCode(code);
    if (e1) { setMsg(e1); return; }
    const e2 = validateNewPassword(password);
    if (e2) { setMsg(e2); return; }
    sendingRef.current = true; setBusy(true); setMsg('');
    try {
      const sb = supabaseBrowser();
      const { error: vErr } = await sb.auth.verifyOtp({
        email: email.trim(), token: code.trim(), type: 'recovery',
      });
      if (vErr) { setMsg('코드가 올바르지 않거나 만료됐어요.'); return; }
      const { error: uErr } = await sb.auth.updateUser({ password });
      if (uErr) { setMsg('비밀번호 변경에 실패했어요. 다시 시도해주세요.'); return; }
      router.refresh();
      router.push('/');
    } catch {
      setMsg('잠시 문제가 생겼어요. 다시 시도해주세요.');
    } finally { setBusy(false); sendingRef.current = false; }
  }

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>비밀번호 재설정</h1>
      {step === 'email' && (
        <>
          <input
            placeholder="email" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && requestCode()}
            aria-label="이메일"
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
          />
          <button onClick={requestCode} disabled={busy}>코드 받기</button>
        </>
      )}
      {step === 'code' && (
        <>
          <input
            placeholder="메일로 받은 6자리 코드" inputMode="numeric" value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="인증 코드"
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
          />
          <input
            placeholder="새 비밀번호 (8자 이상)" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmReset()}
            aria-label="새 비밀번호"
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
          />
          <button onClick={confirmReset} disabled={busy} style={{ marginRight: 8 }}>비밀번호 변경</button>
          <button onClick={() => { setStep('email'); setMsg(''); setCode(''); setPassword(''); }} disabled={busy}>
            이메일 다시 입력
          </button>
        </>
      )}
      {msg && <p style={{ color: msg.startsWith('코드를 메일로') ? 'green' : 'crimson' }}>{msg}</p>}
      <p style={{ marginTop: 16 }}>
        <a href="/login" style={{ fontSize: 13, color: '#0070f3' }}>로그인으로 돌아가기</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/reset/page.tsx`
Expected: both exit 0, no output.

- [ ] **Step 3: Smoke-render check**

Run (no dev server needed for typecheck; render is verified live in Task 4). Confirm the file compiles via the tsc run above.

- [ ] **Step 4: Commit and push**

```bash
git add src/app/reset/page.tsx
git commit -m "feat(auth): add /reset in-app OTP password-reset page"
git push
```

---

### Task 3: Link from the login page

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Add the link after the auth buttons**

Find this block in `src/app/login/page.tsx`:

```tsx
      <button onClick={() => handle('signup')} disabled={busy}>회원가입</button>
      {msg && <p style={{ color: msg.startsWith('가입 완료') ? 'green' : 'crimson' }}>{msg}</p>}
    </main>
```

Replace it with:

```tsx
      <button onClick={() => handle('signup')} disabled={busy}>회원가입</button>
      {msg && <p style={{ color: msg.startsWith('가입 완료') ? 'green' : 'crimson' }}>{msg}</p>}
      <p style={{ marginTop: 12 }}>
        <a href="/reset" style={{ fontSize: 13, color: '#0070f3' }}>비밀번호를 잊으셨나요?</a>
      </p>
    </main>
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/login/page.tsx`
Expected: both exit 0.

- [ ] **Step 3: Commit and push**

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): link login page to /reset"
git push
```

---

### Task 4: Full verification (automated + live) and Supabase config

**Files:** none (verification + one manual dashboard step).

- [ ] **Step 1: Supabase dashboard — enable OTP in the recovery email (MANUAL)**

In the Supabase dashboard for project `npxvjnhzezzcplxdzonf`:
Authentication → Email Templates → "Reset Password" → ensure the template body
includes the 6-digit token, e.g. add a line:

```
재설정 코드: {{ .Token }}
```

Without `{{ .Token }}` the email only carries a link and the in-app OTP cannot work.

- [ ] **Step 2: Full automated checks**

Run:
```bash
npx vitest run
npx tsc --noEmit
npx eslint src tests
```
Expected: vitest 46 passing (43 baseline + 3 new), tsc clean, eslint clean.

- [ ] **Step 3: Live-verify the request step (browse)**

`.env.local` is gitignored and absent from the worktree — copy it in first:
```bash
cp /Users/seungbinmin/Desktop/dev_gStack/NutriCoach/.env.local .
```
Start the dev server on a free port (the main app may be on :3000):
```bash
PORT=3100 npm run dev   # run in background; wait until it serves
```
With the browse tool: goto `http://localhost:3100/reset`, confirm the email input
renders; fill a known test email (`qa4+1780891212@gmail.com`), click "코드 받기";
confirm the UI advances to the code step and shows "코드를 메일로 보냈어요".

- [ ] **Step 4: Full OTP round-trip (manual code entry)**

The 6-digit code is delivered by email and cannot be read programmatically (no
service-role key in `.env.local`). Either:
- enter the code from the received email into the code field + a new password
  (≥8 chars), click "비밀번호 변경", confirm redirect to `/` (signed in); then
  sign in again with the new password to confirm; OR
- if a `SUPABASE_SERVICE_ROLE_KEY` is added to `.env.local`, fetch the OTP via
  `POST {NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link` with
  `{"type":"recovery","email":"..."}` and header `apikey`/`Authorization: Bearer <service_role>`,
  read `email_otp` from the JSON, and drive the code step with the browse tool.

Record the result (pass/fail) in the task notes.

- [ ] **Step 5: Commit any verification artifacts and push**

If only verification ran (no file changes), there is nothing to commit; otherwise:
```bash
git add -A
git commit -m "chore(auth): verify password-reset flow (tests + live)"
git push
```

---

## Out of scope (do not build here)
Email verification ON, change-password while signed in, account deletion, social
login. These are separate specs.
