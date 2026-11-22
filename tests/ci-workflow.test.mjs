import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('GitHub Actions verifies main pushes and pull requests with the production gates', () => {
  assert.match(workflow, /push:[\s\S]*?branches:\s*\[main\]/);
  assert.match(workflow, /pull_request:[\s\S]*?branches:\s*\[main\]/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /run: pnpm test\s*\n/);
  assert.match(workflow, /run: pnpm test:db\s*\n/);
  assert.match(workflow, /run: pnpm build\s*\n/);
  assert.match(workflow, /run: pnpm audit --prod\s*\n/);
  assert.doesNotMatch(workflow, /VITE_SUPABASE_.*=/);
});
