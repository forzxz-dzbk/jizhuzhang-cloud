import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel deployment is configured for Vite SPA and environment template is safe', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.equal(config.framework, 'vite');
  assert.equal(config.buildCommand, 'pnpm build');
  assert.equal(config.outputDirectory, 'dist');
  assert.ok(config.rewrites.some(rule => rule.destination === '/index.html'));
  assert.match(env, /VITE_SUPABASE_URL=https:\/\/your-project\.supabase\.co/);
  assert.match(env, /VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key/);
  assert.doesNotMatch(env, /service_role|secret|eyJ[a-zA-Z0-9_-]{20}/i);
  assert.match(ignore, /\.env\.\*/);
  assert.match(ignore, /!\.env\.example/);
});
