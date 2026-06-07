-- Security hardening (flagged by Supabase security advisor lints 0028/0029):
-- handle_new_user() is a SECURITY DEFINER trigger-only function. It must NOT be
-- callable via the PostgREST RPC API by anon/authenticated/public roles.
-- Revoking EXECUTE removes the API exposure; the on_auth_user_created trigger
-- still invokes it (as the function owner) on signup.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_new_user() from public;
