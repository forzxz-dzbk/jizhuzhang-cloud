import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const worker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
test('PWA has installable shell metadata and app icon', () => { assert.equal(manifest.name, '记祝账'); assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './'); assert.ok(manifest.icons[0].src.startsWith('./')); });
test('service worker only caches same-origin shell/assets, never auth or database API', () => { assert.ok(worker.includes('url.origin !== self.location.origin')); assert.ok(worker.includes('auth|rest|functions')); assert.ok(worker.includes('request.method !== \'GET\'')); });
test('service worker uses the configured base path for production builds', () => { assert.ok(main.includes('`${import.meta.env.BASE_URL}sw.js`')); assert.ok(worker.includes('new URL(\'./\', self.registration.scope)')); assert.ok(worker.includes('url.pathname.startsWith(BASE)')); });

