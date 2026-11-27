import test from 'node:test';
import assert from 'node:assert/strict';
import { formatShanghaiTimestamp, shanghaiCurrentMonth, shanghaiToday } from '../src/shanghai-time.mjs';

test('entry date is always derived from Asia/Shanghai rather than device timezone', () => {
  const instant = new Date('2026-11-26T16:30:00.000Z');
  assert.equal(shanghaiToday(instant), '2026-11-27');
  assert.equal(shanghaiCurrentMonth(instant), '2026-11');
  assert.equal(formatShanghaiTimestamp(instant), '2026-11-27 00:30');
});

test('bad timestamps display safely', () => {
  assert.equal(formatShanghaiTimestamp('not-a-timestamp'), '时间未知');
});
