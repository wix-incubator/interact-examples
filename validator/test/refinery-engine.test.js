// validator/test/refinery-engine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRefinery } from '../lib/refinery.js';
import { getJob } from '../lib/jobs-store.js';

// A fully-faked refinery: generate/capture/judge/refine are instant fakes.
// judgeScript: array of scores the judge returns in order (per judge call).
async function rig({ judgeScript, sections = ['cards'], refinePrefix = 'refined-' }) {
  const runsDir = await mkdtemp(join(tmpdir(), 'iv-eng-'));
  const rootDir = await mkdtemp(join(tmpdir(), 'iv-root-'));
  await mkdir(join(rootDir, 'G'), { recursive: true });
  await writeFile(join(rootDir, 'G', 'A.html'), `<html>trigger: 'viewProgress'</html>`);
  await mkdir(join(rootDir, 'Ani-Mate Prompts', 'G'), { recursive: true });
  await writeFile(join(rootDir, 'Ani-Mate Prompts', 'G', 'A.md'), '# guideline v0');
  let judgeCalls = 0;
  const calls = { generate: 0, capture: 0, refine: [] };
  const refinery = createRefinery({ runsDir, rootDir, deps: {
    listSectionsImpl: async () => sections.map((id) => ({ id, html: `<${id}>`, css: '' })),
    generateImpl: async () => { calls.generate++; return { config: '{"c":1}' }; },
    captureImpl: async (_url, outDir) => { calls.capture++; await mkdir(outDir, { recursive: true });
      return { frames: [join(outDir, 'frame-0.png')], gif: join(outDir, 'anim.gif') }; },
    judgeImpl: async () => ({ score: judgeScript[judgeCalls++], notes: `notes-${judgeCalls}`, sections: [] }),
    refineImpl: async ({ guideline, history, userNotes }) => { calls.refine.push({ history, userNotes });
      return `${refinePrefix}${calls.refine.length}`; },
  } });
  return { refinery, runsDir, rootDir, calls };
}

const wait = (refinery, id) => new Promise((resolve) => {
  refinery.events(id).on('event', (e) => { if (e.type === 'end') resolve(); });
});

test('green path: stops at threshold, records iterations, no refine after the last', async () => {
  const { refinery, runsDir, calls } = await rig({ judgeScript: [5, 8] });
  const { jobs } = await refinery.launch({ promptPaths: ['G/A.md'], sections: ['cards'] });
  await wait(refinery, jobs[0].id);
  const job = await getJob(runsDir, jobs[0].id);
  assert.equal(job.status, 'green');
  assert.equal(job.iterations.length, 2);
  assert.equal(job.iterations[0].guideline, '# guideline v0');
  assert.equal(job.iterations[0].refined, 'refined-1');
  assert.equal(job.iterations[1].guideline, 'refined-1');   // next iter runs with the refined guideline
  assert.equal(job.iterations[1].refined, null);            // stopped — no refine wasted
  assert.equal(calls.refine.length, 1);
  assert.match(calls.refine[0].history || '', /iter 1 → 5\/10/);
});

test('plateau path: two non-improving iterations → amber(plateau)', async () => {
  const { refinery, runsDir } = await rig({ judgeScript: [5, 5, 5] });
  const { jobs } = await refinery.launch({ promptPaths: ['G/A.md'], sections: ['cards'] });
  await wait(refinery, jobs[0].id);
  const job = await getJob(runsDir, jobs[0].id);
  assert.equal(job.status, 'amber');
  assert.equal(job.amberReason, 'plateau');
  assert.equal(job.iterations.length, 3);
});

test('launch validates: missing example file → per-prompt error, no job', async () => {
  const { refinery } = await rig({ judgeScript: [8] });
  const res = await refinery.launch({ promptPaths: ['G/Missing.md'], sections: ['cards'] });
  assert.equal(res.jobs.length, 0);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0].error, /example|prompt/i);
});

test('relaunch resumes from the last refined guideline and consumes userNotes', async () => {
  const { refinery, runsDir, calls } = await rig({ judgeScript: [5, 5, 5, 8] });
  const { jobs } = await refinery.launch({ promptPaths: ['G/A.md'], sections: ['cards'] });
  await wait(refinery, jobs[0].id);                          // → amber(plateau) after 3 iters
  await refinery.relaunch(jobs[0].id, { userNotes: 'focus the images' });
  await wait(refinery, jobs[0].id);
  const job = await getJob(runsDir, jobs[0].id);
  assert.equal(job.status, 'green');                         // 4th judge call returns 8
  assert.equal(job.iterations.length, 4);
  assert.equal(job.iterations[3].guideline, 'refined-3');    // resumed from last refined
  const withNotes = calls.refine.find((c) => c.userNotes === 'focus the images');
  assert.ok(withNotes, 'userNotes must reach the refine step');
  assert.equal(job.userNotes, null, 'userNotes consumed after use');
});

test('relaunch clears a stale stop flag left by a stop() that raced a natural stop', async () => {
  // First run plateaus at iter 3 (scores 5,5,5) without ever consuming the stop
  // flag (the plateau stop happens via `decide`, before the stopFlags check).
  // Then stop() is called on the already-finished job, leaving a stale flag.
  // On relaunch, iter 4 scores 6 (a new best, so `decide` says "continue" —
  // this is the exact spot the bug lived: the loop reaches the stopFlags.has()
  // check with a stale flag and would wrongly force an amber "interrupted"
  // instead of continuing on to iter 5, which scores 8 and goes green.
  const { refinery, runsDir } = await rig({ judgeScript: [5, 5, 5, 6, 8] });
  const { jobs } = await refinery.launch({ promptPaths: ['G/A.md'], sections: ['cards'] });
  await wait(refinery, jobs[0].id);                          // → amber(plateau) after 3 iters
  refinery.stop(jobs[0].id);                                 // seed a stop flag never consumed by the finished run
  const before = await getJob(runsDir, jobs[0].id);
  assert.equal(before.status, 'amber');
  assert.equal(before.amberReason, 'plateau');
  await refinery.relaunch(jobs[0].id);
  await wait(refinery, jobs[0].id);
  const job = await getJob(runsDir, jobs[0].id);
  assert.equal(job.status, 'green');                         // must NOT be spuriously interrupted
  assert.equal(job.iterations.length, 5);
});

test('queue: only 2 jobs run concurrently', async () => {
  const runsDir = await mkdtemp(join(tmpdir(), 'iv-q-'));
  const rootDir = await mkdtemp(join(tmpdir(), 'iv-qroot-'));
  await mkdir(join(rootDir, 'Ani-Mate Prompts', 'G'), { recursive: true });
  await mkdir(join(rootDir, 'G'), { recursive: true });
  for (const n of ['A', 'B', 'C']) {
    await writeFile(join(rootDir, 'G', `${n}.html`), '<html></html>');
    await writeFile(join(rootDir, 'Ani-Mate Prompts', 'G', `${n}.md`), '# g');
  }
  let running = 0, peak = 0;
  const refinery = createRefinery({ runsDir, rootDir, deps: {
    listSectionsImpl: async () => [{ id: 's', html: '<s>', css: '' }],
    generateImpl: async () => { running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 30)); running--; return { config: '{}' }; },
    captureImpl: async (_u, outDir) => { await mkdir(outDir, { recursive: true });
      return { frames: [], gif: join(outDir, 'anim.gif') }; },
    judgeImpl: async () => ({ score: 9, notes: '', sections: [] }),
    refineImpl: async () => 'r',
  } });
  const { jobs } = await refinery.launch({ promptPaths: ['G/A.md', 'G/B.md', 'G/C.md'], sections: ['s'] });
  await Promise.all(jobs.map((j) => wait(refinery, j.id)));
  assert.equal(peak, 2, `expected concurrency 2, saw ${peak}`);
  for (const j of jobs) assert.equal((await getJob(runsDir, j.id)).status, 'green');
});

test('all sections failing generate → amber(generate-error)', async () => {
  const { refinery, runsDir } = await rig({ judgeScript: [] });
  refinery.deps.generateImpl = async () => { throw new Error('502'); };
  const { jobs } = await refinery.launch({ promptPaths: ['G/A.md'], sections: ['cards'] });
  await wait(refinery, jobs[0].id);
  const job = await getJob(runsDir, jobs[0].id);
  assert.equal(job.status, 'amber');
  assert.equal(job.amberReason, 'generate-error');
});
