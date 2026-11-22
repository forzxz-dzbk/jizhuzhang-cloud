import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/supabase.ts', import.meta.url), 'utf8');
const env = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

test('auth gate supports sign-in, sign-up, password recovery and sign-out', () => {
  for (const marker of ['signInWithPassword', 'signUp(', 'resetPasswordForEmail', 'signOut()']) assert.ok(ui.includes(marker), marker);
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
