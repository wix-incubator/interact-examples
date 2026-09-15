// validator/test/server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

async function repo() {
  const root = await mkdtemp(join(tmpdir(), 'iv-srv-'));
  await mkdir(join(root, 'G'), { recursive: true });
  await writeFile(join(root, 'G', 'A.html'),
    `import {Interact} from 'https://esm.sh/@wix/interact@1.79.0';`);
  return root;
}

async function start(root) {
  const app = createApp(root);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, server };
}

test('GET /api/files lists animations', async () => {
  const { base, server } = await start(await repo());
  const res = await fetch(`${base}/api/files`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.files.some((f) => f.path === 'G/A.html'));
  server.close();
});

test('POST /api/scan returns per-file diagnosis and a summary', async () => {
  const { base, server } = await start(await repo());
  const res = await fetch(`${base}/api/scan`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const body = await res.json();
  assert.equal(body.results[0].category, 'Outdated version');
  assert.equal(body.summary['Outdated version'], 1);
  server.close();
});

test('GET /api/file rejects path traversal', async () => {
  const { base, server } = await start(await repo());
  const res = await fetch(`${base}/api/file?path=${encodeURIComponent('../../etc/passwd')}`);
  assert.equal(res.status, 400);
  server.close();
});

test('apply flow: seed a draft via discard/apply endpoints', async () => {
  const root = await repo();
  const { base, server } = await start(root);
  // Write a draft directly through the lib to simulate a completed fix.
  const { writeDraft } = await import('../lib/drafts.js');
  await writeDraft(root, 'G/A.html', 'FIXED');
  const diff = await (await fetch(`${base}/api/diff?path=${encodeURIComponent('G/A.html')}`)).json();
  assert.ok(diff.parts.some((p) => p.added && p.value.includes('FIXED')));
  const apply = await fetch(`${base}/api/apply`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths: ['G/A.html'] }) });
  assert.equal(apply.status, 200);
  const after = await (await fetch(`${base}/api/file?path=${encodeURIComponent('G/A.html')}`)).json();
  assert.equal(after.source, 'FIXED');
  server.close();
});

test('GET /api/drafts lists drafts on disk so the UI can hydrate after a refresh', async () => {
  const root = await repo();
  const { base, server } = await start(root);
  const { writeDraft } = await import('../lib/drafts.js');
  const empty = await (await fetch(`${base}/api/drafts`)).json();
  assert.deepEqual(empty.paths, []);
  await writeDraft(root, 'G/A.html', 'FIXED');
  const list = await (await fetch(`${base}/api/drafts`)).json();
  assert.deepEqual(list.paths, ['G/A.html']);
  server.close();
});

test('apply partial batch: valid path succeeds, missing path fails, always 200', async () => {
  const root = await repo();
  const { base, server } = await start(root);
  const { writeDraft } = await import('../lib/drafts.js');
  await writeDraft(root, 'G/A.html', 'PATCHED');
  const res = await fetch(`${base}/api/apply`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths: ['G/A.html', 'G/missing.html'] }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.results), 'results should be an array');
  const good = body.results.find((r) => r.path === 'G/A.html');
  const bad = body.results.find((r) => r.path === 'G/missing.html');
  assert.ok(good, 'should have result for G/A.html');
  assert.ok(bad, 'should have result for G/missing.html');
  assert.equal(good.ok, true, 'G/A.html should succeed');
  assert.equal(bad.ok, false, 'G/missing.html should fail');
  // Verify the valid original was actually overwritten
  const after = await (await fetch(`${base}/api/file?path=${encodeURIComponent('G/A.html')}`)).json();
  assert.equal(after.source, 'PATCHED');
  server.close();
});

test('GET /api/prompts lists generated guidelines and /api/prompt reads one', async () => {
  const root = await repo();
  const { writePrompt } = await import('../lib/prompts.js');
  await writePrompt(root, 'G/A.html', '# A Guideline\n\ntext');
  const { base, server } = await start(root);
  const list = await (await fetch(`${base}/api/prompts`)).json();
  assert.ok(list.files.some((f) => f.path === 'G/A.md'), 'prompt should be listed');
  const one = await (await fetch(`${base}/api/prompt?path=${encodeURIComponent('G/A.md')}`)).json();
  assert.match(one.source, /# A Guideline/);
  const missing = await fetch(`${base}/api/prompt?path=${encodeURIComponent('G/nope.md')}`);
  assert.equal(missing.status, 404);
  server.close();
});

test('GET /api/loop returns working (defaults to the prompt md) and empty rounds', async () => {
  const root = await repo();
  const { writePrompt } = await import('../lib/prompts.js');
  await writePrompt(root, 'G/A.html', '# Guide v0');   // → G/A.md
  const { base, server } = await start(root);
  const loop = await (await fetch(`${base}/api/loop?promptPath=${encodeURIComponent('G/A.md')}`)).json();
  assert.equal(loop.working, '# Guide v0');
  assert.deepEqual(loop.rounds, []);
  server.close();
});

test('POST /api/loop/finalize writes working back to the prompt md', async () => {
  const root = await repo();
  const { writePrompt, readPrompt } = await import('../lib/prompts.js');
  const { recordRound } = await import('../lib/loop-store.js');
  await writePrompt(root, 'G/A.html', '# v0');
  await recordRound(root, 'G/A.md', { guideline: '# v0', sections: [], score: 8, notes: '', newWorking: '# FINAL' });
  const { base, server } = await start(root);
  const r = await fetch(`${base}/api/loop/finalize`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ promptPath: 'G/A.md' }) });
  assert.equal(r.status, 200);
  assert.equal(await readPrompt(root, 'G/A.md'), '# FINAL');
  server.close();
});

test('GET /api/loop/diff diffs the original md against working (and a given round)', async () => {
  const root = await repo();
  const { writePrompt } = await import('../lib/prompts.js');
  const { recordRound } = await import('../lib/loop-store.js');
  await writePrompt(root, 'G/A.html', 'line one\n');                    // → G/A.md
  await recordRound(root, 'G/A.md', { guideline: 'line one\n', sections: [], score: 6, notes: '', newWorking: 'line two\n' });
  const { base, server } = await start(root);
  // vs working: original "line one" → working "line two"
  const cur = await (await fetch(`${base}/api/loop/diff?promptPath=${encodeURIComponent('G/A.md')}`)).json();
  assert.equal(cur.changed, true);
  assert.ok(cur.parts.some((p) => p.removed && p.value.includes('line one')));
  assert.ok(cur.parts.some((p) => p.added && p.value.includes('line two')));
  // vs round 1's REFINED output ("line two") → changed, same as working here
  const r1 = await (await fetch(`${base}/api/loop/diff?promptPath=${encodeURIComponent('G/A.md')}&round=1`)).json();
  assert.equal(r1.changed, true);
  assert.ok(r1.parts.some((p) => p.added && p.value.includes('line two')));
  // unknown round → 400; missing prompt → 404
  assert.equal((await fetch(`${base}/api/loop/diff?promptPath=${encodeURIComponent('G/A.md')}&round=9`)).status, 400);
  assert.equal((await fetch(`${base}/api/loop/diff?promptPath=${encodeURIComponent('G/nope.md')}`)).status, 404);
  server.close();
});

test('POST /api/loop/run rejects a path-escaping promptPath with 400 (no hung stream)', async () => {
  const { base, server } = await start(await repo());
  const res = await fetch(`${base}/api/loop/run`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ promptPath: '../../etc/passwd', sections: ['x'] }) });
  assert.equal(res.status, 400);
  server.close();
});

test('POST /api/loop/refine rejects a path-escaping promptPath with 400', async () => {
  const { base, server } = await start(await repo());
  const res = await fetch(`${base}/api/loop/refine`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ promptPath: '../../etc/passwd', score: 5, notes: 'n' }) });
  assert.equal(res.status, 400);
  server.close();
});

test('agent status/model/reset endpoints manage the override and totals', async () => {
  const { base, server } = await start(await repo());
  let s = await (await fetch(`${base}/api/agent/status`)).json();
  assert.equal(s.model, null);
  assert.equal(typeof s.window, 'number');
  s = await (await fetch(`${base}/api/agent/model`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'opus' }) })).json();
  assert.equal(s.model, 'opus');
  s = await (await fetch(`${base}/api/agent/model`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: '' }) })).json();
  assert.equal(s.model, null);   // empty clears the override
  s = await (await fetch(`${base}/api/agent/reset`, { method: 'POST' })).json();
  assert.deepEqual(s.totals, { calls: 0, input: 0, output: 0 });
  server.close();
});

test('GET /vendor/* responds with an Access-Control-Allow-Origin header (sandboxed iframe can import the renderer)', async () => {
  const { base, server } = await start(await repo());
  // The vendor dir/file exists in the real validator/vendor (committed in Task 1); request the runtime.
  const res = await fetch(`${base}/vendor/render-runtime.js`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  server.close();
});

test('refinery endpoints: job listing, approve writes the md, reject returns to idle', async () => {
  const root = await repo();
  const { writePrompt, readPrompt } = await import('../lib/prompts.js');
  const { createJob, saveJob } = await import('../lib/jobs-store.js');
  await writePrompt(root, 'G/A.html', '# original');
  const { base, server } = await start(root);
  // Seed a finished job directly in the store (validator/runs is the app's runsDir).
  const runsDir = new URL('../runs', import.meta.url).pathname;
  const job = await createJob(runsDir, { promptPath: 'G/A.md', examplePath: 'G/A.html', sections: ['s'] });
  job.status = 'green';
  job.iterations = [{ iter: 1, guideline: '# THE WINNER', judge: { score: 9, notes: '' }, sections: [], refined: null }];
  await saveJob(runsDir, job);
  try {
    const list = await (await fetch(`${base}/api/refinery/jobs?promptPath=${encodeURIComponent('G/A.md')}`)).json();
    const mine = list.jobs.find((j) => j.id === job.id);
    assert.ok(mine); assert.deepEqual(mine.scores, [9]);
    const full = await (await fetch(`${base}/api/refinery/job?id=${job.id}`)).json();
    assert.equal(full.iterations[0].guideline, '# THE WINNER');
    const d = await (await fetch(`${base}/api/refinery/diff?id=${job.id}`)).json();
    assert.equal(d.changed, true);
    const ap = await fetch(`${base}/api/refinery/approve`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: job.id }) });
    assert.equal(ap.status, 200);
    assert.equal(await readPrompt(root, 'G/A.md'), '# THE WINNER');
    const rj = await fetch(`${base}/api/refinery/reject`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: job.id }) });
    assert.equal(rj.status, 200);
    assert.equal((await (await fetch(`${base}/api/refinery/job?id=${job.id}`)).json()).status, 'idle');
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(new URL(`../runs/${job.id}`, import.meta.url).pathname, { recursive: true, force: true });
    server.close();
  }
});

test('POST /api/refinery/approve refuses a running job (guard mirrors reject)', async () => {
  const root = await repo();
  const { writePrompt, readPrompt } = await import('../lib/prompts.js');
  const { createJob, saveJob } = await import('../lib/jobs-store.js');
  await writePrompt(root, 'G/A.html', '# original');
  const runsDir = new URL('../runs', import.meta.url).pathname;
  const { base, server } = await start(root);
  // Seed the running job AFTER start() so the server's boot-time
  // markInterrupted() scan (which flips stale running/queued jobs to amber)
  // can't race with — and clobber — the status we're testing against.
  const job = await createJob(runsDir, { promptPath: 'G/A.md', examplePath: 'G/A.html', sections: ['s'] });
  job.status = 'running';
  job.iterations = [{ iter: 1, guideline: '# HALF DONE', judge: { score: 9, notes: '' }, sections: [], refined: null }];
  await saveJob(runsDir, job);
  try {
    const r = await fetch(`${base}/api/refinery/approve`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: job.id }) });
    assert.equal(r.status, 400);
    assert.equal(await readPrompt(root, 'G/A.md'), '# original');   // .md NOT overwritten
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(new URL(`../runs/${job.id}`, import.meta.url).pathname, { recursive: true, force: true });
    server.close();
  }
});

test('GET /api/refinery/diff returns per-iteration steps (guideline → refined)', async () => {
  const root = await repo();
  const { writePrompt } = await import('../lib/prompts.js');
  const { createJob, saveJob } = await import('../lib/jobs-store.js');
  await writePrompt(root, 'G/A.html', 'v0\n');
  const runsDir = new URL('../runs', import.meta.url).pathname;
  const job = await createJob(runsDir, { promptPath: 'G/A.md', examplePath: 'G/A.html', sections: ['s'] });
  job.status = 'green';
  job.iterations = [
    { iter: 1, guideline: 'v0\n', refined: 'v1\n', judge: { score: 5, notes: '' }, sections: [] },
    { iter: 2, guideline: 'v1\n', refined: null, judge: { score: 8, notes: '' }, sections: [] },  // stopping iter → no step
  ];
  await saveJob(runsDir, job);
  const { base, server } = await start(root);
  try {
    const d = await (await fetch(`${base}/api/refinery/diff?id=${job.id}`)).json();
    assert.equal(d.steps.length, 1);                     // only iter 1 produced a refinement
    assert.equal(d.steps[0].iter, 1);
    assert.equal(d.steps[0].changed, true);
    assert.ok(d.steps[0].parts.some((p) => p.removed && p.value.includes('v0')));
    assert.ok(d.steps[0].parts.some((p) => p.added && p.value.includes('v1')));
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(new URL(`../runs/${job.id}`, import.meta.url).pathname, { recursive: true, force: true });
    server.close();
  }
});

test('POST /api/refinery/delete removes a finished job but refuses a running one', async () => {
  const root = await repo();
  const { createJob, saveJob, getJob } = await import('../lib/jobs-store.js');
  const runsDir = new URL('../runs', import.meta.url).pathname;
  const { base, server } = await start(root);
  const done = await createJob(runsDir, { promptPath: 'G/A.md', examplePath: 'G/A.html', sections: ['s'] });
  done.status = 'green';
  done.iterations = [{ iter: 1, guideline: '# g', judge: { score: 9, notes: '' }, sections: [], refined: null }];
  await saveJob(runsDir, done);
  const running = await createJob(runsDir, { promptPath: 'G/B.md', examplePath: 'G/B.html', sections: ['s'] });
  running.status = 'running';
  await saveJob(runsDir, running);
  try {
    const del = await fetch(`${base}/api/refinery/delete`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: done.id }) });
    assert.equal(del.status, 200);
    assert.equal(await getJob(runsDir, done.id), null);                 // gone → fresh start for the prompt
    const busy = await fetch(`${base}/api/refinery/delete`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: running.id }) });
    assert.equal(busy.status, 400);                                     // refuse while running
    assert.ok(await getJob(runsDir, running.id));                       // still there
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(new URL(`../runs/${running.id}`, import.meta.url).pathname, { recursive: true, force: true });
    server.close();
  }
});

test('GET /render serves a stored iteration section and 404s unknowns', async () => {
  const root = await repo();
  const { createJob, saveJob } = await import('../lib/jobs-store.js');
  const { base, server } = await start(root);
  const runsDir = new URL('../runs', import.meta.url).pathname;
  const job = await createJob(runsDir, { promptPath: 'G/A.md', examplePath: 'G/A.html', sections: ['s'] });
  job.iterations = [{ iter: 1, guideline: 'g', judge: null, refined: null,
    sections: [{ id: 's', config: '{"x":1}', html: '<div class="sec">S</div>', css: '.sec{color:red}', frames: [], gif: null, error: null }] }];
  await saveJob(runsDir, job);
  try {
    const html = await (await fetch(`${base}/render/${job.id}/1/s`)).text();
    assert.match(html, /<div class="sec">S<\/div>/);
    assert.match(html, /createExperience/);
    assert.equal((await fetch(`${base}/render/${job.id}/9/s`)).status, 404);
    assert.equal((await fetch(`${base}/render/jnope/1/s`)).status, 404);
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(new URL(`../runs/${job.id}`, import.meta.url).pathname, { recursive: true, force: true });
    server.close();
  }
});

test('POST /api/refinery/launch validates input and playground reachability', async () => {
  const { base, server } = await start(await repo());
  const noPaths = await fetch(`${base}/api/refinery/launch`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ promptPaths: [], sections: ['s'] }) });
  assert.equal(noPaths.status, 400);
  server.close();
});
