import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJudgePrompt, parseJudgeOutput, judgeIteration } from '../lib/judge.js';

const inputs = {
  guideline: '# Card Fan',
  exampleSource: '<html>ORIGINAL CODE</html>',
  exampleTriggers: ['viewProgress'],
  originalFrames: ['/runs/j1/original/frame-0.png'],
  sections: [
    { id: 'cards', frames: ['/runs/j1/iter-1/cards/frame-0.png'], config: '{"c":1}' },
    { id: 'hero', error: 'generate failed: 502' },
  ],
};

test('buildJudgePrompt embeds rubric, frames, code, triggers, and per-section errors', () => {
  const { system, user } = buildJudgePrompt(inputs);
  assert.match(system, /pattern fidelity/i);
  assert.match(system, /integrity/i);
  assert.match(system, /content differences .* not .*penali/is);
  assert.match(system, /ONLY .*JSON/is);
  assert.match(user, /# Card Fan/);
  assert.match(user, /ORIGINAL CODE/);
  assert.match(user, /viewProgress/);
  assert.match(user, /frame-0\.png/);
  assert.match(user, /generate failed: 502/);
});

test('parseJudgeOutput handles clean and fenced JSON, rejects bad shapes', () => {
  const good = '{"score": 7, "notes": "n", "sections": [{"id":"cards","issues":[]}]}';
  assert.equal(parseJudgeOutput(good).score, 7);
  assert.equal(parseJudgeOutput('```json\n' + good + '\n```').score, 7);
  assert.throws(() => parseJudgeOutput('not json'), /parse/i);
  assert.throws(() => parseJudgeOutput('{"score": "high"}'), /score/i);
  assert.throws(() => parseJudgeOutput('{"score": 11, "notes":""}'), /score/i);
});

test('judgeIteration retries once on parse failure with the error appended', async () => {
  const calls = [];
  const runAgent = async (sys, user) => {
    calls.push(user);
    return calls.length === 1 ? 'garbage' : '{"score": 6, "notes": "better", "sections": []}';
  };
  const out = await judgeIteration(inputs, { runAgent, addDir: '/runs/j1' });
  assert.equal(out.score, 6);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /previous reply was not valid/i);
});

test('judgeIteration surfaces a final failure after the retry', async () => {
  const runAgent = async () => 'still garbage';
  await assert.rejects(() => judgeIteration(inputs, { runAgent, addDir: '/x' }), /parse/i);
});
