import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePrompt, readPrompt } from '../lib/prompts.js';
import { readLoop, recordRound, rollback, finalize, roundRefined } from '../lib/loop-store.js';

async function repoWithPrompt() {
  const root = await mkdtemp(join(tmpdir(), 'iv-loop-'));
  await writePrompt(root, 'G/Card.html', '# V0 guideline');   // creates G/Card.md
  return root;
}

test('readLoop defaults working to the .md and rounds to []', async () => {
  const root = await repoWithPrompt();
  const loop = await readLoop(root, 'G/Card.md');
  assert.equal(loop.working, '# V0 guideline');
  assert.deepEqual(loop.rounds, []);
});

test('recordRound appends a round and updates working', async () => {
  const root = await repoWithPrompt();
  await recordRound(root, 'G/Card.md', {
    guideline: '# V0 guideline', sections: [{ id: 'cards', config: '{}' }], score: 6, notes: 'more spread', newWorking: '# V1 guideline' });
  const loop = await readLoop(root, 'G/Card.md');
  assert.equal(loop.working, '# V1 guideline');
  assert.equal(loop.rounds.length, 1);
  assert.equal(loop.rounds[0].round, 1);
  assert.equal(loop.rounds[0].score, 6);
  assert.equal(loop.rounds[0].sections[0].id, 'cards');
});

test('rollback sets working back to a round guideline', async () => {
  const root = await repoWithPrompt();
  await recordRound(root, 'G/Card.md', { guideline: '# V0 guideline', sections: [], score: 5, notes: '', newWorking: '# V1' });
  await recordRound(root, 'G/Card.md', { guideline: '# V1', sections: [], score: 7, notes: '', newWorking: '# V2' });
  const { working } = await rollback(root, 'G/Card.md', 1);
  assert.equal(working, '# V0 guideline');       // round 1's guideline field
  assert.equal((await readLoop(root, 'G/Card.md')).working, '# V0 guideline');
});

test('finalize writes working back to the .md', async () => {
  const root = await repoWithPrompt();
  await recordRound(root, 'G/Card.md', { guideline: '# V0 guideline', sections: [], score: 9, notes: '', newWorking: '# FINAL' });
  await finalize(root, 'G/Card.md');
  assert.equal(await readPrompt(root, 'G/Card.md'), '# FINAL');
});

test('rounds keep their refined output; rollback cannot destroy it', async () => {
  const root = await repoWithPrompt();
  await recordRound(root, 'G/Card.md', { guideline: '# V0 guideline', sections: [], score: 5, notes: '', newWorking: '# V1' });
  await recordRound(root, 'G/Card.md', { guideline: '# V1', sections: [], score: 7, notes: '', newWorking: '# V2' });
  await rollback(root, 'G/Card.md', 1);                       // working → '# V0 guideline'
  const loop = await readLoop(root, 'G/Card.md');
  assert.equal(roundRefined(loop, 1), '# V1');                // survives the rollback
  assert.equal(roundRefined(loop, 2), '# V2');
  assert.equal(roundRefined(loop, 9), null);                  // unknown round
});

test('roundRefined falls back for legacy histories without a refined field', () => {
  const loop = { working: '# V2', rounds: [
    { round: 1, guideline: '# V0' },                          // legacy: no refined
    { round: 2, guideline: '# V1' },
  ] };
  assert.equal(roundRefined(loop, 1), '# V1');                // next round's input
  assert.equal(roundRefined(loop, 2), '# V2');                // last round → working
});
