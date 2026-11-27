import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const worker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
test('PWA has installable shell metadata and app icon', () => { assert.equal(manifest.name, '记祝账'); assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './'); assert.ok(manifest.icons[0].src.startsWith('./')); });
test('service worker only caches same-origin shell/assets, never auth or database API', () => { assert.ok(worker.includes('url.origin !== self.location.origin')); assert.ok(worker.includes('auth|rest|functions')); assert.ok(worker.includes('request.method !== \'GET\'')); });
test('service worker uses the configured base path for production builds', () => { assert.ok(main.includes('`${import.meta.env.BASE_URL}sw.js`')); assert.ok(worker.includes('new URL(\'./\', self.registration.scope)')); assert.ok(worker.includes('url.pathname.startsWith(BASE)')); });
test('iPhone transaction rows use a non-shrinking mobile grid for text, amount, and actions', () => { assert.match(styles, /\.transaction-list li\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/); assert.match(styles, /\.transaction-list li>\.transaction-copy\{grid-column:1;min-width:0/); assert.match(styles, /\.transaction-list li>\.transaction-actions\{grid-column:1\/-1;width:auto/); });
test('iPhone quick-entry dialogs respect safe areas and scroll within dynamic viewport', () => { assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover"/); assert.match(styles, /\.quick-entry-backdrop\{height:100vh;height:100dvh/); assert.match(styles, /\.quick-entry-sheet\{width:100%;max-height:calc\(100vh - env\(safe-area-inset-top\)\);max-height:calc\(100dvh - env\(safe-area-inset-top\)\)/); assert.match(styles, /\.category-grid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/); assert.match(styles, /\.category-tile\{width:100%;min-width:0/); });

