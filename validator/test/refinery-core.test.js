// validator/test/refinery-core.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, historyBlock, extractTriggers } from '../lib/refinery.js';

const stop = { threshold: 8, maxIters: 5, plateau: 2 };
const iters = (...scores) => scores.map((s, i) => ({ iter: i + 1, judge: { score: s }, guideline: `G${i + 1}` }));

test('decide: green as soon as the threshold is met', () => {
  assert.deepEqual(decide({ iterations: iters(8), stop }), { action: 'stop', status: 'green', reason: null });
  assert.deepEqual(decide({ iterations: iters(5, 9), stop }), { action: 'stop', status: 'green', reason: null });
});

test('decide: continue while below threshold and improving', () => {
  assert.deepEqual(decide({ iterations: iters(5), stop }), { action: 'continue' });
  assert.deepEqual(decide({ iterations: iters(5, 6), stop }), { action: 'continue' });
  assert.deepEqual(decide({ iterations: iters(5, 4, 6), stop }), { action: 'continue' }); // one dip then a new best
});

test('decide: plateau = two consecutive iterations without a new best', () => {
  assert.deepEqual(decide({ iterations: iters(5, 5, 5), stop }), { action: 'stop', status: 'amber', reason: 'plateau' });
  assert.deepEqual(decide({ iterations: iters(5, 6, 6, 5), stop }), { action: 'stop', status: 'amber', reason: 'plateau' });
  assert.deepEqual(decide({ iterations: iters(5, 5), stop }), { action: 'continue' }); // only ONE non-improving iter so far
});

test('decide: cap → amber below threshold (green case is caught by the threshold rule)', () => {
  assert.deepEqual(decide({ iterations: iters(5, 6, 7, 6, 7), stop }), { action: 'stop', status: 'amber', reason: 'cap' });
});

test('decide: judge errors (no score) count as non-improving', () => {
  const its = [ { iter: 1, judge: { score: 5 } }, { iter: 2, judge: { error: 'x' } }, { iter: 3, judge: { error: 'y' } } ];
  assert.deepEqual(decide({ iterations: its, stop }), { action: 'stop', status: 'amber', reason: 'plateau' });
});

test('historyBlock renders compact one-liners and truncates', () => {
  const its = [
    { iter: 1, judge: { score: 5, notes: 'ranges finish prematurely\nsecond line ignored' } },
    { iter: 2, judge: { score: 6, notes: 'x'.repeat(300) } },
    { iter: 3, judge: { error: 'parse' } },
  ];
  const block = historyBlock(its);
  assert.match(block, /iter 1 → 5\/10: ranges finish prematurely/);
  assert.match(block, new RegExp(`iter 2 → 6/10: x{200}(?!x)`));
  assert.match(block, /iter 3 → judge failed/);
  assert.equal(historyBlock([]), '');
});

test('extractTriggers finds unique trigger types', () => {
  const src = `trigger: 'viewProgress' ... trigger: "hover" ... trigger: 'viewProgress'`;
  assert.deepEqual(extractTriggers(src), ['viewProgress', 'hover']);
  assert.deepEqual(extractTriggers('no triggers here'), []);
});
