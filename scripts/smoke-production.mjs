import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvText, runProductionSmoke } from '../src/production-smoke-core.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
let localConfig = {};
try { localConfig = parseEnvText(await readFile(resolve(projectRoot, '.env.local'), 'utf8')); } catch {}
const config = { ...localConfig, ...process.env };
const result = await runProductionSmoke({
  siteUrl: config.JIZHUZHANG_SITE_URL || 'https://forzxz-dzbk.github.io/jizhuzhang-cloud/',
  supabaseUrl: config.VITE_SUPABASE_URL,
  publishableKey: config.VITE_SUPABASE_PUBLISHABLE_KEY,
});

for (const check of result.checks) {
  const details = check.details ? ` — ${check.details}` : '';
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${details}`);
}
console.log(result.ok ? 'Production smoke passed; no ledger tables were queried.' : 'Production smoke failed.');
if (!result.ok) process.exitCode = 1;
