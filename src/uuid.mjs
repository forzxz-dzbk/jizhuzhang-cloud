// crypto.randomUUID is missing in older iOS Safari versions. getRandomValues
// is available in HTTPS secure contexts on those browsers and still gives a
// cryptographically strong id for idempotency keys.
export function createRequestId(fillRandom = bytes => globalThis.crypto.getRandomValues(bytes)) {
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
