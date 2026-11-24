import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/supabase.ts', import.meta.url), 'utf8');
const env = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

test('auth gate supports sign-in, sign-up, password recovery and sign-out', () => {
  for (const marker of ['signInWithPassword', 'signUp(', 'resetPasswordForEmail', 'signOut()']) assert.ok(ui.includes(marker), marker);
});
test('signup and password-recovery emails return to the deployed app base path', () => {
  assert.match(ui, /new URL\(import\.meta\.env\.BASE_URL, window\.location\.origin\)/);
  assert.match(ui, /options: \{ emailRedirectTo: authRedirectTo \}/);
  assert.match(ui, /resetPasswordForEmail\(normalizedEmail, \{ redirectTo: authRedirectTo \}\)/);
  assert.equal(new URL('/jizhuzhang-cloud/', 'https://forzxz-dzbk.github.io').toString(), 'https://forzxz-dzbk.github.io/jizhuzhang-cloud/');
});
test('expired signup confirmations can be resent to the deployed app base path', () => {
  assert.match(ui, /supabase\.auth\.resend\(\{/);
  assert.match(ui, /type: 'signup'/);
  assert.match(ui, /mode === 'signup'.*重新发送确认邮件/s);
  assert.match(ui, /如该邮箱存在待验证账户，请查收新的确认邮件/);
});
test('password recovery token opens a new-password flow and persists the update', () => {
  for (const marker of ["event === 'PASSWORD_RECOVERY'", "setMode('recovery_password')", "mode === 'recovery_password'", 'updateUser({ password })', '设置新密码', "session && mode !== 'recovery_password'"]) assert.ok(ui.includes(marker), marker);
});
test('auth state is restored and listener is unsubscribed', () => {
  assert.ok(ui.includes('getSession()'));
  assert.ok(ui.includes('onAuthStateChange'));
  assert.ok(ui.includes('subscription.unsubscribe()'));
});
test('client uses only public Vite environment keys and fails closed when missing', () => {
  assert.match(client, /VITE_SUPABASE_URL/);
  assert.match(client, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(client, /configurationError \? null/);
  assert.doesNotMatch(client + env, /service_role/i);
});
