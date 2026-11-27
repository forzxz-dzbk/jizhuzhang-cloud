import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestId } from '../src/uuid.mjs';

test('request id is an RFC 4122 version-4 UUID without randomUUID support', () => {
  const id = createRequestId(bytes => bytes.fill(0));
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('request ids use random bytes for unique idempotency keys', () => {
  let seed = 0;
  const id = createRequestId(bytes => bytes.forEach((_, index) => { bytes[index] = seed + index; }));
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
