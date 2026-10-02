import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIsoDate, resolveWinningNumbers, isWinningBet, canSettleBetType, resolveOpenDraw, computeRtp } from '../src/services/lottoRules.js';

test('reject impossible dates and preserve Bangkok draw boundaries', () => {
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2024-02-29'), true);
  const draw = resolveOpenDraw({ code: 'th-lottery', closeTime: '14:30', now: new Date('2026-10-01T07:29:00Z') });
  assert.equal(draw.drawDate, '2026-10-01');
  assert.equal(resolveOpenDraw({ code: 'th-lottery', closeTime: '14:30', now: new Date('2026-10-01T07:31:00Z') }).drawDate, '2026-10-16');
});
test('incomplete results remain pending and duplicate digits use exact multiplicity', () => {
  const result = resolveWinningNumbers('th-lottery', { firstPrize: '123112', frontThree: ['456', '789'] });
  assert.equal(isWinningBet('three-tod', '121', result), true);
  assert.equal(isWinningBet('three-tod', '122', result), false);
  assert.equal(isWinningBet('three-front', '789', result), true);
  assert.equal(canSettleBetType('two-bottom', result), false);
  assert.equal(computeRtp('three-front-tod', 75), 0.9);
});
test('test convention for Lao lower digits and explicit override', () => {
  assert.equal(resolveWinningNumbers('lao-lottery', { firstPrize: '4546' }).bottom2, '45');
  assert.equal(resolveWinningNumbers('lao-lottery', { firstPrize: '4546', extra: { twoBottom: '78' } }).bottom2, '78');
});
