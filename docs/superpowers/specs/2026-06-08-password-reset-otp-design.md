# Design: Password reset via in-app OTP

Date: 2026-06-08
Status: APPROVED (brainstorming)
Branch: main
Author: seungbinmin (with Claude)

## Summary
Add a "forgot password" flow to the existing email+password auth, using an in-app
6-digit OTP code (not an email link). The whole flow completes inside the app, with
no external-browser handoff — chosen because the product is headed for a WebView
wrapper where an email-link redirect would bounce the user out to the system browser
and back. This is the first piece of hardening the email/password auth to
production grade.

## Scope
In scope:
- A password-reset flow: request a code by email, enter the code + a new password, get signed in.

Explicitly OUT of scope (deferred, separate specs):
- Email verification ON (signup stays frictionless / confirm-email OFF for now).
- Change password while logged in.
- Account deletion.
- Social login (Kakao / Google / Apple).

## Current state (what exists)
- `src/app/login/page.tsx` — email+password sign-in / sign-up via `supabaseBrowser().auth.signInWithPassword` / `signUp`.
- `src/lib/supabase/browser.ts`, `server.ts` — `@supabase/ssr` clients (cookie-based sessions).
- `src/middleware.ts` — refreshes the session on each request.
- No reset, no social, email confirmation currently OFF.

## User flow
1. On the login screen, a "비밀번호 찾기" link navigates to `/reset`.
2. **Step 1 (email):** user enters their email → client calls `resetPasswordForEmail(email)`.
   The UI then advances to Step 2 and shows "코드를 메일로 보냈어요" — shown regardless of
   whether the email exists (user-enumeration prevention; Supabase returns the same
   response for unknown emails).
3. **Step 2 (code + new password):** user enters the 6-digit code and a new password →
   client calls `verifyOtp({ email, token, type: 'recovery' })` to establish a session,
   then `updateUser({ password })`.
4. On success the user is now authenticated → `router.refresh()` + redirect to `/`.
   On failure → inline error, stay on Step 2.

## Architecture & components
- **`src/app/reset/page.tsx`** (new) — a client component implementing a 2-step state
  machine: `'email'` → `'code'`. Holds `{ step, email, code, password, busy, msg }`.
  Uses `supabaseBrowser()`. Reuses the synchronous `useRef` re-entrancy guard pattern
  from `Chat.tsx` (the QA double-send fix) so a double-tap can't fire duplicate
  requests.
- **`src/app/login/page.tsx`** (edit) — add a "비밀번호 찾기" link to `/reset`.
- **Validation helper (pure, testable):** extract `validateResetInput` (email format,
  password min length 8, code is 6 digits) into a small pure module
  (e.g. `src/lib/auth/resetValidation.ts`) so the rules are unit-testable without the
  Supabase SDK.
- **Supabase dashboard config (NOT code, but required — call out in the plan):**
  Auth → Email Templates → "Reset Password" template must include `{{ .Token }}` so the
  recovery email carries the 6-digit code (default template only has the link).

## Data flow / Supabase API
- Request: `supabase.auth.resetPasswordForEmail(email)` — sends the recovery email
  (template includes the token). No redirect URL needed for the OTP path.
- Verify: `supabase.auth.verifyOtp({ email, token, type: 'recovery' })` — on success
  returns a session (cookies set via `@supabase/ssr`).
- Set password: `supabase.auth.updateUser({ password })` — requires the session from
  the verify step.
- Session afterward: unchanged — the existing cookie-based session + middleware refresh
  carry it. No new session handling.

## Error handling & security
- Invalid / expired code → inline "코드가 올바르지 않거나 만료됐어요." (from `verifyOtp` error).
- Weak password → client-side min-length (8) check before calling `updateUser`; Supabase
  password policy is the backstop.
- User enumeration → Step 1 shows the same "코드를 보냈어요" message whether or not the
  email exists.
- Double submit → synchronous ref guard + disabled button while a request is pending.
- Rate limiting & OTP expiry (default ~1h) → provided by Supabase; no extra code.
- All user-facing messages in Korean, friendly tone (match existing login page).

## WebView fitness
- Entire flow completes inside the app/WebView — no external-browser handoff (the reason
  OTP was chosen over the email-link approach).
- The email itself is read in the user's mail app, but code entry and password reset
  happen in the WebView.
- Session persistence in WebView (cookies) is unchanged from today; if a WebView cookie-
  persistence issue surfaces later, it is handled in a follow-up, not here.

## Testing
- **Unit (vitest):** `validateResetInput` (email format, password ≥ 8, 6-digit code);
  the step-transition logic if extracted as a pure reducer.
- **Live E2E (once):** real email received → enter code → reset → sign in with the new
  password, driven through the browse tool against real Supabase (as in prior QA passes).
- Keep the Supabase calls behind a thin wrapper so the component logic is testable and
  the SDK boundary is mockable.

## Open questions
- None blocking. (Password min-length is set to 8; revisit if a stricter policy is wanted.)

## Dependencies / sequencing
- No schema change; no new tables.
- Depends on the Supabase "Reset Password" email template being edited to include
  `{{ .Token }}` — a one-time dashboard step the plan must list as a manual task.
- Independent of the approved Log/Coach pivot and the streak design; can ship before or
  alongside them.
