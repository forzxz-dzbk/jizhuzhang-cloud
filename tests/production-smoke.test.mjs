import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMobileStyles, parseEnvText, runProductionSmoke } from '../src/production-smoke-core.mjs';

const html = '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js"></script>';
const css = '.transaction-list li{display:grid;grid-template-columns:minmax(0,1fr) auto}.category-grid{grid-template-columns:repeat(4,minmax(0,1fr))}@media (max-width:760px),(pointer:coarse){.quick-entry-sheet{max-height:100dvh;padding-bottom:env(safe-area-inset-bottom)}}';

test('production CSS probe accepts minified iPhone media queries', () => {
  assert.deepEqual(inspectMobileStyles(html, css), { viewportFit: true, coarsePointerLayout: true, transactionGrid: true, fourColumnCategories: true, dynamicViewport: true, safeArea: true });
});

test('environment parser reads public client settings without modifying or logging them', () => {
  assert.deepEqual(parseEnvText('# ignored\nexport VITE_SUPABASE_URL="https://example.supabase.co"\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example=tail'), { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example=tail' });
});

test('production smoke checks only public assets and Auth health, never ledger APIs', async () => {
  const requested = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    requested.push(url.pathname);
    if (url.pathname === '/app/') return new Response(html, { status: 200 });
    if (url.pathname.endsWith('.css')) return new Response(css, { status: 200 });
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('/sw.js')) return new Response('', { status: 200 });
    if (url.pathname === '/auth/v1/health') return new Response('', { status: 200 });
    return new Response('', { status: 404 });
  };
  const result = await runProductionSmoke({ siteUrl: 'https://example.test/app/', supabaseUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_public', fetchImpl });
  assert.equal(result.ok, true);
  assert.ok(result.checks.every((check) => check.ok));
  assert.deepEqual(requested, ['/app/', '/assets/app.css', '/assets/app.js', '/app/sw.js', '/auth/v1/health']);
  assert.equal(requested.some((path) => /rest\/v1|transactions|accounts/.test(path)), false);
});
