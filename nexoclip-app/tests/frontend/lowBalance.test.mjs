import test from 'node:test';
import assert from 'node:assert/strict';
import { lowBalanceLevel, nextLowBalanceDialog } from '../../src/lib/lowBalance.js';

test('the balance level is low under 100 credits and empty under 1', () => {
  assert.equal(lowBalanceLevel(null), null);
  assert.equal(lowBalanceLevel('250'), null);
  assert.equal(lowBalanceLevel('99.5'), 'low');
  assert.equal(lowBalanceLevel('0.4'), 'empty');
});

test('the top-up dialog shows once per level, again when credits run out, and again after a top-up', () => {
  assert.deepEqual(nextLowBalanceDialog('low', null), { open: true, seen: 'low' });
  assert.deepEqual(nextLowBalanceDialog('low', 'low'), { open: false, seen: 'low' });
  assert.deepEqual(nextLowBalanceDialog('empty', 'low'), { open: true, seen: 'empty' });
  assert.deepEqual(nextLowBalanceDialog('low', 'empty'), { open: false, seen: 'empty' });
  assert.deepEqual(nextLowBalanceDialog(null, 'empty'), { open: false, seen: null }); // topped up: armed again
  assert.deepEqual(nextLowBalanceDialog('low', null), { open: true, seen: 'low' });
});
