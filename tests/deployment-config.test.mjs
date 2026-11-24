import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GitHub Pages deployment is configured for Vite and environment template is safe', async () => {
  const config = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
  const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.ok(config.includes("'/jizhuzhang-cloud/'"));
  assert.ok(workflow.includes('actions/deploy-pages@v4'));
  assert.ok(workflow.includes('VITE_SUPABASE_URL'));
  assert.ok(workflow.includes('VITE_SUPABASE_PUBLISHABLE_KEY'));
  assert.ok(workflow.includes('pnpm build'));
  assert.match(env, /VITE_SUPABASE_URL=https:\/\/your-project\.supabase\.co/);
  assert.match(env, /VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key/);
  assert.doesNotMatch(env, /service_role|secret|eyJ[a-zA-Z0-9_-]{20}/i);
  assert.match(ignore, /\.env\.\*/);
  assert.match(ignore, /!\.env\.example/);
});
