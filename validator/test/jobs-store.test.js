import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { examplePathFor, createJob, saveJob, getJob, listJobs, jobDir, deleteJob, markInterrupted, finalGuideline } from '../lib/jobs-store.js';

const dir = () => mkdtemp(join(tmpdir(), 'iv-runs-'));

test('examplePathFor inverts promptRelPath', () => {
  assert.equal(examplePathFor('G/Card.md'), 'G/Card.html');
  assert.equal(examplePathFor('Deep/Nested/x.md'), 'Deep/Nested/x.html');
});

test('createJob persists a well-formed queued job; getJob round-trips', async () => {
  const runs = await dir();
  const job = await createJob(runs, { promptPath: 'G/A.md', examplePath: 'G/A.html', sections: ['cards'] });
  assert.match(job.id, /^j[a-z0-9]+$/);
  assert.equal(job.status, 'queued');
  assert.deepEqual(job.stop, { threshold: 8, maxIters: 5, plateau: 2 });
  assert.deepEqual(job.iterations, []);
  const back = await getJob(runs, job.id);
  assert.deepEqual(back, job);
  assert.equal(await getJob(runs, 'jnope'), null);
});

test('listJobs scans job dirs, newest first', async () => {
  const runs = await dir();
  const a = await createJob(runs, { promptPath: 'G/A.md', examplePath: 'G/A.html', sections: ['s'] });
  await new Promise((r) => setTimeout(r, 5));
  const b = await createJob(runs, { promptPath: 'G/B.md', examplePath: 'G/B.html', sections: ['s'] });
  const all = await listJobs(runs);
  assert.deepEqual(all.map((j) => j.id), [b.id, a.id]);
});

test('jobDir rejects malformed ids (path safety)', async () => {
  const runs = await dir();
  assert.throws(() => jobDir(runs, '../escape'));
  assert.throws(() => jobDir(runs, 'j/../x'));
});

test('markInterrupted flips running/queued to amber(interrupted)', async () => {
  const runs = await dir();
  const j1 = await createJob(runs, { promptPath: 'G/A.md', examplePath: 'G/A.html', sections: ['s'] });
  j1.status = 'running'; await saveJob(runs, j1);
  const j2 = await createJob(runs, { promptPath: 'G/B.md', examplePath: 'G/B.html', sections: ['s'] });
  const j3 = await createJob(runs, { promptPath: 'G/C.md', examplePath: 'G/C.html', sections: ['s'] });
  j3.status = 'green'; await saveJob(runs, j3);
  const n = await markInterrupted(runs);
  assert.equal(n, 2);
  assert.equal((await getJob(runs, j1.id)).status, 'amber');
  assert.equal((await getJob(runs, j1.id)).amberReason, 'interrupted');
  assert.equal((await getJob(runs, j2.id)).status, 'amber');
  assert.equal((await getJob(runs, j3.id)).status, 'green');
});

test('finalGuideline picks the best-scoring iteration, latest on tie', () => {
  const job = { iterations: [
    { iter: 1, guideline: 'G1', judge: { score: 5 } },
    { iter: 2, guideline: 'G2', judge: { score: 7 } },
    { iter: 3, guideline: 'G3', judge: { score: 7 } },
    { iter: 4, guideline: 'G4', judge: { error: 'boom' } },
  ] };
  assert.equal(finalGuideline(job), 'G3');
  assert.equal(finalGuideline({ iterations: [] }), null);
});

test('deleteJob removes the job (getJob→null, gone from listJobs); missing id is a no-op', async () => {
  const runs = await mkdtemp(join(tmpdir(), 'iv-runs-'));
  const a = await createJob(runs, { promptPath: 'G/A.md', examplePath: 'G/A.html', sections: ['s'] });
  const b = await createJob(runs, { promptPath: 'G/B.md', examplePath: 'G/B.html', sections: ['s'] });
  await deleteJob(runs, a.id);
  assert.equal(await getJob(runs, a.id), null);
  const remaining = await listJobs(runs);
  assert.deepEqual(remaining.map((j) => j.id), [b.id]);
  await deleteJob(runs, 'jdoesnotexist');   // idempotent — no throw
});
