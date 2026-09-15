# Autonomous Prompt Refinement (Refinery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Autonomous refinement jobs: select prompts + sections → the server iterates generate → capture (Playwright frames+GIF) → vision judge → refine until green (score ≥8) / amber (plateau/cap), two jobs in parallel; the user approves the final guideline from live rendered previews.

**Architecture:** Node-orchestrated pipeline (spec Approach A). `lib/refinery.js` owns the loop as deterministic code with all four steps injectable; job state persists to `validator/runs/<jobId>/job.json` after every step; every model call is a fresh one-shot `claude -p` subprocess so parallel jobs are isolated by construction. The UI is a stateless window onto `job.json`.

**Tech Stack:** Node 18+ ESM, Express, `playwright` (chromium already cached on this machine), `gifenc` + `fast-png` (GIF assembly), the local `claude` CLI via `lib/agent.js`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-09-auto-refinement-design.md`

## Global Constraints

- **interact-xp is READ-ONLY** (`PLAYGROUND_REPO`): only read files, import built `dist`, HTTP the dev server. Never write/build/install/checkout there.
- Stop rule: green when judge score **≥ 8**; hard cap **5 iterations**; plateau = **two consecutive iterations without a new best score** → amber. Cap reached → green if last score ≥8 else amber.
- Concurrency: **2 jobs**; others queue. Statuses: `queued → running → green|amber|failed`, then `approved` or `idle` (reject). Amber reasons: `plateau`, `cap`, `interrupted`, `judge-error`, `capture-error`, `generate-error`.
- Judge rubric: **pattern fidelity + integrity**; content differences never penalized; strict JSON out `{score, notes, sections:[{id, issues:[]}]}`; one retry on parse failure.
- Every model call honors the topbar model override (`lib/agent-state.js`) and is a fresh subprocess.
- Job artifacts live in `validator/runs/` (gitignored, served at `/runs`). The repo root is served read-only at `/repo`. Prompt paths validated via `lib/prompts.js` guards.
- Approve is the ONLY operation that writes a `.md` (via `writePromptRaw`).
- All new code under `validator/`; ESM; tests run with `node --test`. SSE endpoints opt in via `Accept: text/event-stream`.
- Plan deviation from spec (intentional): no `runs/index.json` — `listJobs` scans `runs/*/job.json` (trivial at this scale, no consistency risk).

---

### Task 1: Jobs store (`lib/jobs-store.js`)

**Files:**
- Create: `validator/lib/jobs-store.js`
- Create: `validator/runs/.gitignore` (content: `*\n!.gitignore\n`)
- Test: `validator/test/jobs-store.test.js`

**Interfaces:**
- Produces (all used by Tasks 6–8):
  - `examplePathFor(promptRel) -> string` — `'G/Card.md' → 'G/Card.html'` (inverse of `promptRelPath`).
  - `createJob(runsDir, { promptPath, examplePath, sections, stop? }) -> Promise<job>` — persists and returns `{ id, promptPath, examplePath, sections, status:'queued', amberReason:null, userNotes:null, stop:{threshold:8,maxIters:5,plateau:2}, iterations:[], createdAt, updatedAt }`.
  - `saveJob(runsDir, job) -> Promise<void>` (stamps `updatedAt`), `getJob(runsDir, id) -> Promise<job|null>`, `listJobs(runsDir) -> Promise<job[]>` (newest first).
  - `jobDir(runsDir, id) -> string` (validates id shape `^j[a-z0-9]+$`, throws otherwise — path safety).
  - `markInterrupted(runsDir) -> Promise<number>` — every `running`/`queued` job → `status:'amber', amberReason:'interrupted'`; returns count.
  - `finalGuideline(job) -> string|null` — the `guideline` of the best-scoring iteration (ties → latest); iterations without a judge score are ignored; `null` if none.

- [ ] **Step 1: Write the failing tests**

```js
// validator/test/jobs-store.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { examplePathFor, createJob, saveJob, getJob, listJobs, jobDir, markInterrupted, finalGuideline } from '../lib/jobs-store.js';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd validator && node --test test/jobs-store.test.js`
Expected: FAIL — `Cannot find module '../lib/jobs-store.js'`.

- [ ] **Step 3: Implement**

```js
// validator/lib/jobs-store.js
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

// 'G/Card.md' -> 'G/Card.html' (inverse of prompts.js promptRelPath).
export function examplePathFor(promptRel) {
  return promptRel.replace(/\.md$/i, '.html');
}

export function jobDir(runsDir, id) {
  if (!/^j[a-z0-9]+$/.test(id)) throw new Error(`bad job id: ${id}`);
  const abs = resolve(runsDir, id);
  const base = resolve(runsDir);
  if (!abs.startsWith(base + sep)) throw new Error('job path escapes runs dir');
  return abs;
}

const newId = () => `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function saveJob(runsDir, job) {
  job.updatedAt = new Date().toISOString();
  const dir = jobDir(runsDir, job.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'job.json'), JSON.stringify(job, null, 2), 'utf8');
}

export async function createJob(runsDir, { promptPath, examplePath, sections, stop }) {
  const job = {
    id: newId(), promptPath, examplePath, sections,
    status: 'queued', amberReason: null, userNotes: null,
    stop: { threshold: 8, maxIters: 5, plateau: 2, ...(stop || {}) },
    iterations: [],
    createdAt: new Date().toISOString(), updatedAt: null,
  };
  await saveJob(runsDir, job);
  return job;
}

export async function getJob(runsDir, id) {
  try { return JSON.parse(await readFile(join(jobDir(runsDir, id), 'job.json'), 'utf8')); }
  catch { return null; }
}

export async function listJobs(runsDir) {
  let entries;
  try { entries = await readdir(runsDir, { withFileTypes: true }); }
  catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || !/^j[a-z0-9]+$/.test(e.name)) continue;
    const job = await getJob(runsDir, e.name);
    if (job) out.push(job);
  }
  return out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// Boot recovery: execution died with the server; the records survive.
export async function markInterrupted(runsDir) {
  let n = 0;
  for (const job of await listJobs(runsDir)) {
    if (job.status === 'running' || job.status === 'queued') {
      job.status = 'amber'; job.amberReason = 'interrupted';
      await saveJob(runsDir, job); n++;
    }
  }
  return n;
}

// The guideline the user approves: best judge score, latest wins ties.
export function finalGuideline(job) {
  let best = null;
  for (const it of job.iterations || []) {
    const s = it.judge && typeof it.judge.score === 'number' ? it.judge.score : null;
    if (s === null) continue;
    if (!best || s >= best.score) best = { score: s, guideline: it.guideline };
  }
  return best ? best.guideline : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd validator && node --test test/jobs-store.test.js` — Expected: PASS (6 tests).

- [ ] **Step 5: Create `validator/runs/.gitignore`** with exactly:

```
*
!.gitignore
```

- [ ] **Step 6: Full suite + commit**

Run: `cd validator && node --test` — Expected: all pass.

```bash
git add validator/lib/jobs-store.js validator/test/jobs-store.test.js validator/runs/.gitignore
git commit -m "feat(validator): refinery jobs store (persisted job records, boot recovery)"
```

---

### Task 2: Stop rule + history block + trigger extraction (pure core of `lib/refinery.js`)

**Files:**
- Create: `validator/lib/refinery.js` (pure functions only; Task 6 adds the engine to this file)
- Test: `validator/test/refinery-core.test.js`

**Interfaces:**
- Produces:
  - `decide({ iterations, stop }) -> { action:'stop', status:'green'|'amber', reason:null|'plateau'|'cap' } | { action:'continue' }` — iterations carry `judge.score`.
  - `historyBlock(iterations) -> string` — compact `iter N → S/10: first-line-of-notes` lines (notes truncated to 200 chars), `''` when empty.
  - `extractTriggers(source) -> string[]` — unique `trigger: 'x'` values from example HTML source.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run to verify failure** — `cd validator && node --test test/refinery-core.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement (pure part of `validator/lib/refinery.js`)**

```js
// validator/lib/refinery.js — autonomous refinement engine.
// This file starts with the pure core (decide/historyBlock/extractTriggers);
// the job runner + queue are added by a later task.

const scoreOf = (it) => (it.judge && typeof it.judge.score === 'number' ? it.judge.score : null);

// Stop rule: green at threshold; amber on plateau (two consecutive iterations
// without a NEW BEST score — errors count as non-improving); amber at the cap.
export function decide({ iterations, stop }) {
  const last = scoreOf(iterations[iterations.length - 1]);
  if (last !== null && last >= stop.threshold) return { action: 'stop', status: 'green', reason: null };

  let best = -Infinity, sinceBest = 0;
  for (const it of iterations) {
    const s = scoreOf(it);
    if (s !== null && s > best) { best = s; sinceBest = 0; }
    else sinceBest++;
  }
  if (sinceBest >= stop.plateau) return { action: 'stop', status: 'amber', reason: 'plateau' };
  if (iterations.length >= stop.maxIters) return { action: 'stop', status: 'amber', reason: 'cap' };
  return { action: 'continue' };
}

// Compact cross-iteration memory for the refiner (explicit, never a session).
export function historyBlock(iterations) {
  return (iterations || []).map((it) => {
    const s = scoreOf(it);
    if (s === null) return `iter ${it.iter} → judge failed`;
    const note = String(it.judge.notes || '').split('\n')[0].slice(0, 200);
    return `iter ${it.iter} → ${s}/10: ${note}`;
  }).join('\n');
}

// Trigger types used by the original example (told to the judge: scroll sweeps
// can't show hover/click states, so it must not penalize them).
export function extractTriggers(source) {
  const out = [];
  for (const m of String(source).matchAll(/trigger:\s*['"](\w+)['"]/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass** — `cd validator && node --test test/refinery-core.test.js` → PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add validator/lib/refinery.js validator/test/refinery-core.test.js
git commit -m "feat(validator): refinery stop rule, history block, trigger extraction"
```

---

### Task 3: Capture (`lib/capture.js`, Playwright + GIF)

**Files:**
- Modify: `validator/package.json` (deps)
- Create: `validator/lib/capture.js`
- Test: `validator/test/capture.test.js`

**Interfaces:**
- Produces:
  - `scrollPositions(scrollHeight, viewportHeight, frames) -> number[]` (pure).
  - `captureSweep(url, outDir, { frames=8, viewport={width:1280,height:800}, settleMs=150, browser }) -> Promise<{ frames: string[], gif: string }>` — writes `frame-0.png … frame-N.png` + `anim.gif` into `outDir`. `browser` (a Playwright Browser) is injectable/reusable; when omitted, launches and closes its own chromium.
  - `makeGif(pngBuffers, gifPath, { delayMs=500 }) -> Promise<void>`.

- [ ] **Step 1: Install deps**

Run: `cd validator && npm install playwright gifenc fast-png`
Expected: added to `dependencies`. (Chromium is already in `~/Library/Caches/ms-playwright`; if `captureSweep` later errors with "Executable doesn't exist", run `npx playwright install chromium` once.)

- [ ] **Step 2: Write the failing tests**

```js
// validator/test/capture.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scrollPositions, captureSweep } from '../lib/capture.js';

test('scrollPositions spreads evenly from 0 to maxScroll', () => {
  assert.deepEqual(scrollPositions(4800, 800, 5), [0, 1000, 2000, 3000, 4000]);
  assert.deepEqual(scrollPositions(800, 800, 8), [0]);      // nothing to scroll
  assert.deepEqual(scrollPositions(1000, 800, 2), [0, 200]);
  assert.deepEqual(scrollPositions(500, 800, 3), [0]);      // shorter than viewport
});

// Real-browser smoke: skipped when Playwright/chromium is unavailable.
test('captureSweep captures frames + gif from a static page', { timeout: 60000 }, async (t) => {
  let chromium;
  try { ({ chromium } = await import('playwright')); await (await chromium.launch()).close(); }
  catch { t.skip('playwright/chromium unavailable'); return; }
  const dir = await mkdtemp(join(tmpdir(), 'iv-cap-'));
  const page = join(dir, 'page.html');
  await writeFile(page, `<!doctype html><body style="margin:0">
    <div style="height:300vh;background:linear-gradient(red,blue)"></div></body>`);
  const out = join(dir, 'out');
  const res = await captureSweep(`file://${page}`, out, { frames: 3, settleMs: 20 });
  assert.equal(res.frames.length, 3);
  for (const f of res.frames) await access(f);
  await access(res.gif);
});
```

- [ ] **Step 3: Run to verify failure** — `cd validator && node --test test/capture.test.js` → FAIL (module not found).

- [ ] **Step 4: Implement**

```js
// validator/lib/capture.js — headless scroll-sweep capture: PNG frames + a GIF.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { decode } from 'fast-png';

// Even scroll stops from top to bottom (viewport-relative). Pure.
export function scrollPositions(scrollHeight, viewportHeight, frames) {
  const max = Math.max(0, scrollHeight - viewportHeight);
  if (max === 0) return [0];
  const n = Math.max(2, frames);
  return Array.from({ length: n }, (_, i) => Math.round((max * i) / (n - 1)));
}

// PNG buffers -> animated GIF (256-color quantized).
export async function makeGif(pngBuffers, gifPath, { delayMs = 500 } = {}) {
  const gif = GIFEncoder();
  for (const buf of pngBuffers) {
    const { data, width, height, channels } = decode(buf);
    let rgba = data;
    if (channels === 3) {                       // expand RGB -> RGBA
      rgba = new Uint8Array(width * height * 4);
      for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        rgba[j] = data[i]; rgba[j + 1] = data[i + 1]; rgba[j + 2] = data[i + 2]; rgba[j + 3] = 255;
      }
    }
    const palette = quantize(rgba, 256);
    gif.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay: delayMs });
  }
  gif.finish();
  await writeFile(gifPath, gif.bytes());
}

export async function captureSweep(url, outDir,
  { frames = 8, viewport = { width: 1280, height: 800 }, settleMs = 150, browser } = {}) {
  await mkdir(outDir, { recursive: true });
  const { chromium } = await import('playwright');
  const own = !browser;
  const b = browser || await chromium.launch();
  try {
    const page = await b.newPage({ viewport });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}); // animations may keep requests alive
    await page.waitForTimeout(400);             // initial settle (fonts, first paint)
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const stops = scrollPositions(scrollHeight, viewport.height, frames);
    const paths = [], buffers = [];
    for (let i = 0; i < stops.length; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), stops[i]);
      await page.waitForTimeout(settleMs);
      const buf = await page.screenshot({ type: 'png' });
      const p = join(outDir, `frame-${i}.png`);
      await writeFile(p, buf);
      paths.push(p); buffers.push(buf);
    }
    await page.close();
    const gif = join(outDir, 'anim.gif');
    await makeGif(buffers, gif);
    return { frames: paths, gif };
  } finally {
    if (own) await b.close();
  }
}
```

- [ ] **Step 5: Run tests** — `cd validator && node --test test/capture.test.js` → PASS (2 tests; the smoke may take ~5s).

- [ ] **Step 6: Commit**

```bash
git add validator/package.json validator/package-lock.json validator/lib/capture.js validator/test/capture.test.js
git commit -m "feat(validator): playwright scroll-sweep capture (frames + gif)"
```

---

### Task 4: Judge (`lib/judge.js`) + agent Read-tool support

**Files:**
- Modify: `validator/lib/agent.js:38-40` (extend runAgent opts)
- Create: `validator/lib/judge.js`
- Test: `validator/test/judge.test.js`

**Interfaces:**
- Consumes: `runAgent(system, user, { model, onDelta, allowedTools, addDirs })` (extended here).
- Produces:
  - `buildJudgePrompt({ guideline, exampleSource, exampleTriggers, originalFrames, sections }) -> { system, user }` — `sections: [{ id, frames, gif?, config?, error? }]`.
  - `parseJudgeOutput(text) -> { score, notes, sections }` — fence-stripped strict JSON; throws with a descriptive message on invalid shape.
  - `judgeIteration(inputs, { runAgent, addDir, onDelta, model }) -> Promise<parsed>` — one retry on parse failure (appends the parse error to the user prompt).

- [ ] **Step 1: Extend `runAgent` (in `validator/lib/agent.js`)**

Replace the args block:

```js
      const args = ['-p', '--output-format', 'stream-json', '--include-partial-messages',
        '--verbose', '--system-prompt-file', sysFile, '--exclude-dynamic-system-prompt-sections'];
      const effModel = model || getAgentState().model;   // explicit > UI override > CLI default
      if (effModel) args.push('--model', effModel);
```

with (signature becomes `runAgent(system, user, { model, onDelta, allowedTools, addDirs } = {})`):

```js
      const args = ['-p', '--output-format', 'stream-json', '--include-partial-messages',
        '--verbose', '--system-prompt-file', sysFile, '--exclude-dynamic-system-prompt-sections'];
      if (allowedTools?.length) args.push('--allowedTools', allowedTools.join(','));
      for (const d of addDirs || []) args.push('--add-dir', d);
      const effModel = model || getAgentState().model;   // explicit > UI override > CLI default
      if (effModel) args.push('--model', effModel);
```

(Destructure `allowedTools, addDirs` in the function signature. Existing callers pass neither — unchanged behavior.)

- [ ] **Step 2: Write the failing tests**

```js
// validator/test/judge.test.js
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
```

- [ ] **Step 3: Run to verify failure** — `cd validator && node --test test/judge.test.js` → FAIL (module not found).

- [ ] **Step 4: Implement**

```js
// validator/lib/judge.js — one fresh vision call per iteration: reads the
// original example's frames + each generated section's frames and returns a
// strict-JSON verdict. Isolation: every call is a new claude subprocess.
import { runAgent as realRunAgent } from './agent.js';

const SYSTEM = `You are a strict animation reviewer for @wix/interact guidelines. You compare an ORIGINAL animation example against GENERATED results produced by applying a prose guideline to different website sections.

Grade on exactly two axes:
1. PATTERN FIDELITY — do the generated animations express the SAME MOTION PATTERN as the original (direction, stagger, easing feel, scroll-range pacing — e.g. the animation must span the full scroll range, not finish prematurely), adapted sensibly to each section's own elements? The RIGHT elements must move (e.g. images/cards as the visual subject — not stray text or buttons).
2. INTEGRITY — is each section's layout intact? Nothing clipped, missing, overlapping, or invisible; every element that existed still renders.

The sections have DIFFERENT content and layout than the original BY DESIGN. Content differences are expected and must NOT be penalized. You are shown scroll-sweep screenshots; triggers other than scroll (hover, click) cannot appear in them — do not penalize what frames cannot show.

Read the screenshot files you are given (Read tool) before scoring. Score 1-10 where 8 means "ship it".

OUTPUT CONTRACT: reply with ONLY a JSON object, no fence, no prose:
{"score": <1-10>, "notes": "<holistic, pattern-level feedback for improving the guideline>", "sections": [{"id": "<section id>", "issues": ["<specific problem>", ...]}]}`;

export function buildJudgePrompt({ guideline, exampleSource, exampleTriggers, originalFrames, sections }) {
  const secBlocks = sections.map((s) => s.error
    ? `### Section "${s.id}"\nGENERATION FAILED: ${s.error} (score integrity accordingly)`
    : `### Section "${s.id}"\nFrames (read these):\n${s.frames.map((f) => `- ${f}`).join('\n')}\nGenerated config:\n${s.config}`
  ).join('\n\n');
  const user = `## The guideline under test
${guideline}

## Original example
Triggers used: ${exampleTriggers.join(', ') || 'unknown'}
Source code:
\`\`\`html
${exampleSource}
\`\`\`
Frames of the original (read these):
${originalFrames.map((f) => `- ${f}`).join('\n')}

## Generated results
${secBlocks}

Read all frame files, then reply with the JSON verdict only.`;
  return { system: SYSTEM, user };
}

export function parseJudgeOutput(text) {
  let t = String(text).trim();
  const m = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  if (m) t = m[1].trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('judge output: could not parse JSON (no object found)');
  let obj;
  try { obj = JSON.parse(t.slice(start, end + 1)); }
  catch (e) { throw new Error(`judge output: could not parse JSON (${e.message})`); }
  if (typeof obj.score !== 'number' || obj.score < 1 || obj.score > 10)
    throw new Error('judge output: score must be a number 1-10');
  return { score: obj.score, notes: String(obj.notes || ''), sections: Array.isArray(obj.sections) ? obj.sections : [] };
}

export async function judgeIteration(inputs, { runAgent = realRunAgent, addDir, onDelta, model } = {}) {
  const { system, user } = buildJudgePrompt(inputs);
  const opts = { model, onDelta, allowedTools: ['Read'], addDirs: addDir ? [addDir] : [] };
  try {
    return parseJudgeOutput(await runAgent(system, user, opts));
  } catch (err) {
    const retryUser = `${user}\n\nYour previous reply was not valid: ${err.message}. Reply with ONLY the JSON object.`;
    return parseJudgeOutput(await runAgent(system, retryUser, opts));
  }
}
```

- [ ] **Step 5: Run tests** — `cd validator && node --test test/judge.test.js` → PASS (4 tests). Then the full suite (agent.js changed): `node --test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add validator/lib/agent.js validator/lib/judge.js validator/test/judge.test.js
git commit -m "feat(validator): vision judge (pattern fidelity + integrity) with Read-tool agent calls"
```

---

### Task 5: Refine memory (`lib/refine.js` extension)

**Files:**
- Modify: `validator/lib/refine.js`
- Test: `validator/test/refine.test.js` (append)

**Interfaces:**
- Produces: `buildRefinePrompt({ guideline, score, notes, history?, userNotes? })` and `refineGuideline({ guideline, score, notes, history?, userNotes?, onDelta, model, runAgent })` — backward compatible (existing callers pass neither).
  - `history`: a preformatted string (from `historyBlock`) — rendered under "Previous iterations".
  - `userNotes`: human guidance rendered under "Additional reviewer guidance (from the human)".

- [ ] **Step 1: Append failing tests to `validator/test/refine.test.js`**

```js
test('buildRefinePrompt includes history and user notes when given, with no-regression instruction', () => {
  const { system, user } = buildRefinePrompt({ guideline: '# G', score: 6, notes: 'n',
    history: 'iter 1 → 5/10: ranges premature', userNotes: 'make images the subject' });
  assert.match(system, /without regressing/i);
  assert.match(user, /Previous iterations:/);
  assert.match(user, /iter 1 → 5\/10: ranges premature/);
  assert.match(user, /guidance \(from the human\)/i);
  assert.match(user, /make images the subject/);
});

test('buildRefinePrompt omits history/userNotes sections when absent (backward compatible)', () => {
  const { user } = buildRefinePrompt({ guideline: '# G', score: 6, notes: 'n' });
  assert.doesNotMatch(user, /Previous iterations:/);
  assert.doesNotMatch(user, /guidance \(from the human\)/i);
});
```

- [ ] **Step 2: Run to verify failure** — `cd validator && node --test test/refine.test.js` → the two new tests FAIL.

- [ ] **Step 3: Implement**

In `validator/lib/refine.js`: append to the `SYSTEM` constant (after the RULES list item about pattern level):

```
- When previous-iteration history is provided, address the CURRENT feedback without regressing what earlier iterations already fixed.
```

Replace `buildRefinePrompt` with:

```js
export function buildRefinePrompt({ guideline, score, notes, history, userNotes }) {
  const historyPart = history ? `\nPrevious iterations:\n${history}\n` : '';
  const humanPart = userNotes ? `\nAdditional reviewer guidance (from the human):\n${userNotes}\n` : '';
  const user = `Reviewer score: ${score}/10

Reviewer notes (holistic, not specific to one output):
${notes || '(none)'}
${historyPart}${humanPart}
Current guideline to improve:
${guideline}`;
  return { system: SYSTEM, user };
}
```

And thread the params through `refineGuideline`:

```js
export async function refineGuideline({ guideline, score, notes, history, userNotes, onDelta, model, runAgent = realRunAgent }) {
  const { system, user } = buildRefinePrompt({ guideline, score, notes, history, userNotes });
  return stripFence(await runAgent(system, user, { model, onDelta }));
}
```

- [ ] **Step 4: Run tests** — `cd validator && node --test test/refine.test.js` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add validator/lib/refine.js validator/test/refine.test.js
git commit -m "feat(validator): refine with explicit iteration history + human notes"
```

---

### Task 6: Engine (queue + job runner in `lib/refinery.js`)

**Files:**
- Modify: `validator/lib/refinery.js` (append the engine to the pure core)
- Test: `validator/test/refinery-engine.test.js`

**Interfaces:**
- Consumes: `jobs-store.js` (all), `decide`/`historyBlock`/`extractTriggers` (same file), and injected step impls.
- Produces (used by Task 7):
  - `createRefinery({ runsDir, rootDir, deps }) -> refinery` where `deps = { generateImpl, captureImpl, judgeImpl, refineImpl, listSectionsImpl, readPromptImpl, readExampleImpl }` (every step injectable; real defaults wired in Task 7).
  - `refinery.launch({ promptPaths, sections }) -> Promise<{ jobs }>` — validates each prompt + example exists; per-prompt failures return `{ promptPath, error }` entries instead of jobs.
  - `refinery.stop(id)` (flag: finish current iteration then amber `interrupted`), `refinery.relaunch(id, { userNotes }) -> Promise<job>` (amber/idle → re-queued, resumes from the last iteration's refined guideline).
  - `refinery.events(id) -> EventEmitter` emitting `('event', { type, ...data })` with types `step|log|iteration|status|end`.
  - `refinery.concurrency = 2` (exposed for tests).

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run to verify failure** — `cd validator && node --test test/refinery-engine.test.js` → FAIL (`createRefinery` not exported).

- [ ] **Step 3: Implement (append to `validator/lib/refinery.js`)**

```js
// ── Engine: queue (concurrency 2) + per-job iteration loop ─────────────────
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createJob, saveJob, getJob, jobDir, finalGuideline, examplePathFor } from './jobs-store.js';
import { readPrompt } from './prompts.js';

export function createRefinery({ runsDir, rootDir, port = process.env.PORT || 4500, deps = {} }) {
  const emitters = new Map();          // jobId -> EventEmitter
  const stopFlags = new Set();         // jobIds asked to stop after the current iteration
  const queue = [];                    // jobIds waiting
  let active = 0;
  const CONCURRENCY = 2;

  const events = (id) => { if (!emitters.has(id)) emitters.set(id, new EventEmitter()); return emitters.get(id); };
  const emit = (id, type, data = {}) => events(id).emit('event', { type, ...data });

  const readExample = deps.readExampleImpl || ((rel) => readFile(resolve(rootDir, rel), 'utf8'));

  async function runIteration(job, guideline, sectionMetas) {
    const iter = job.iterations.length + 1;
    const iterRec = { iter, guideline, sections: [], judge: null, refined: null };

    // 1) generate (bounded by section count; per-section isolation)
    emit(job.id, 'step', { iter, step: 'generate' });
    await Promise.all(sectionMetas.map(async (s) => {
      try {
        const { config } = await deps.generateImpl({ html: s.promptHtml || s.html, css: s.css, guideline });
        iterRec.sections.push({ id: s.id, config, html: s.html, css: s.css, frames: [], gif: null, error: null });
      } catch (err) {
        iterRec.sections.push({ id: s.id, config: null, html: s.html, css: s.css, frames: [], gif: null, error: String(err.message || err) });
      }
    }));
    iterRec.sections.sort((a, b) => a.id.localeCompare(b.id));
    job.iterations.push(iterRec);
    await saveJob(runsDir, job);
    if (iterRec.sections.every((s) => s.error)) return { failed: 'generate-error' };

    // 2) capture each generated section (served by our own /render route)
    emit(job.id, 'step', { iter, step: 'capture' });
    for (const s of iterRec.sections) {
      if (s.error) continue;
      const outDir = join(jobDir(runsDir, job.id), `iter-${iter}`, s.id);
      try {
        const { frames, gif } = await deps.captureImpl(
          `http://localhost:${port}/render/${job.id}/${iter}/${encodeURIComponent(s.id)}`, outDir);
        s.frames = frames; s.gif = gif;
      } catch (err) {
        try {   // one retry per spec
          const { frames, gif } = await deps.captureImpl(
            `http://localhost:${port}/render/${job.id}/${iter}/${encodeURIComponent(s.id)}`, outDir);
          s.frames = frames; s.gif = gif;
        } catch (err2) { return { failed: 'capture-error', detail: String(err2.message || err2) }; }
      }
    }
    await saveJob(runsDir, job);

    // 3) judge (fresh subprocess; retry lives inside judgeIteration)
    emit(job.id, 'step', { iter, step: 'judge' });
    try {
      iterRec.judge = await deps.judgeImpl({
        guideline,
        exampleSource: job._exampleSource,
        exampleTriggers: job._exampleTriggers,
        originalFrames: job._originalFrames,
        sections: iterRec.sections.map((s) => ({ id: s.id, frames: s.frames, config: s.config, error: s.error })),
      }, { addDir: jobDir(runsDir, job.id), onDelta: (t, kind) => emit(job.id, 'log', { text: t, kind }) });
    } catch (err) {
      iterRec.judge = { error: String(err.message || err) };
      await saveJob(runsDir, job);
      return { failed: 'judge-error' };
    }
    await saveJob(runsDir, job);
    emit(job.id, 'iteration', { iter, score: iterRec.judge.score });

    // 4) decide
    const verdict = decide({ iterations: job.iterations, stop: job.stop });
    if (verdict.action === 'stop') return { verdict };
    if (stopFlags.has(job.id)) { stopFlags.delete(job.id); return { verdict: { action: 'stop', status: 'amber', reason: 'interrupted' } }; }

    // 5) refine (explicit curated memory; userNotes consumed once)
    emit(job.id, 'step', { iter, step: 'refine' });
    const refined = await deps.refineImpl({
      guideline, score: iterRec.judge.score, notes: iterRec.judge.notes,
      history: historyBlock(job.iterations.slice(0, -1)),
      userNotes: job.userNotes,
      onDelta: (t, kind) => emit(job.id, 'log', { text: t, kind }),
    });
    if (job.userNotes) { job.userNotes = null; }
    iterRec.refined = refined;
    await saveJob(runsDir, job);
    return { next: refined };
  }

  async function runJob(id) {
    const job = await getJob(runsDir, id);
    if (!job) return;
    job.status = 'running';
    await saveJob(runsDir, job);
    emit(id, 'status', { status: 'running' });
    try {
      // Per-job cached context: example source/triggers + original capture (once).
      job._exampleSource = await readExample(job.examplePath);
      job._exampleTriggers = extractTriggers(job._exampleSource);
      const origDir = join(jobDir(runsDir, id), 'original');
      // Reuse a previous run's original capture (persisted as job.originalFrames).
      job._originalFrames = job.originalFrames?.length ? job.originalFrames : null;
      if (!job._originalFrames) {
        emit(id, 'step', { iter: 0, step: 'capture-original' });
        const { frames } = await deps.captureImpl(
          `http://localhost:${port}/repo/${job.examplePath.split('/').map(encodeURIComponent).join('/')}`, origDir);
        job._originalFrames = frames;
      }
      const all = await deps.listSectionsImpl();
      const chosen = all.filter((s) => job.sections.includes(s.id));
      if (!chosen.length) throw new Error('none of the selected sections exist');

      // Resume: continue from the last refined guideline, else the prompt's .md.
      let guideline = job.iterations.length
        ? (job.iterations[job.iterations.length - 1].refined ?? finalGuideline(job) ?? await readPrompt(rootDir, job.promptPath))
        : await readPrompt(rootDir, job.promptPath);
      if (guideline === null) throw new Error('prompt .md not found');

      for (;;) {
        const res = await runIteration(job, guideline, chosen);
        if (res.failed) { job.status = 'amber'; job.amberReason = res.failed; break; }
        if (res.verdict) { job.status = res.verdict.status; job.amberReason = res.verdict.reason || null; break; }
        guideline = res.next;
      }
    } catch (err) {
      job.status = 'failed';
      job.error = String(err.message || err);
    }
    // Strip the per-run cache before persisting (frames of the original ARE persisted).
    const { _exampleSource, _exampleTriggers, ...rest } = job;
    rest.originalFrames = job._originalFrames || rest.originalFrames || [];
    delete rest._originalFrames;
    await saveJob(runsDir, rest);
    emit(id, 'status', { status: rest.status, reason: rest.amberReason });
    emit(id, 'end');
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const id = queue.shift();
      active++;
      runJob(id).finally(() => { active--; pump(); });
    }
  }

  return {
    deps, events, concurrency: CONCURRENCY,
    async launch({ promptPaths, sections }) {
      const jobs = [], errors = [];
      for (const promptPath of promptPaths) {
        try {
          const examplePath = examplePathFor(promptPath);
          if (await readPrompt(rootDir, promptPath) === null) throw new Error('prompt .md not found');
          await readExample(examplePath);   // throws if the example file is missing
          const job = await createJob(runsDir, { promptPath, examplePath, sections });
          jobs.push(job); queue.push(job.id);
        } catch (err) {
          errors.push({ promptPath, error: String(err.message || err) });
        }
      }
      pump();
      return { jobs, errors };
    },
    stop(id) { stopFlags.add(id); },
    async relaunch(id, { userNotes } = {}) {
      const job = await getJob(runsDir, id);
      if (!job) throw new Error('no such job');
      if (job.status === 'running' || job.status === 'queued') throw new Error('job is already active');
      job.status = 'queued'; job.amberReason = null;
      if (userNotes) job.userNotes = userNotes;
      await saveJob(runsDir, job);
      queue.push(id); pump();
      return job;
    },
  };
}
```


- [ ] **Step 4: Run tests** — `cd validator && node --test test/refinery-engine.test.js` → PASS (6 tests). Full suite: `node --test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add validator/lib/refinery.js validator/test/refinery-engine.test.js
git commit -m "feat(validator): refinery engine (queue of 2, resumable iteration loop)"
```

---

### Task 7: Server wiring (endpoints, statics, render route, boot recovery)

**Files:**
- Modify: `validator/server.js`
- Test: `validator/test/server.test.js` (append)

**Interfaces:**
- Consumes: `createRefinery` (Task 6), `jobs-store.js`, real step impls: `generate` (playground.js), `captureSweep` (capture.js), `judgeIteration` (judge.js), `refineGuideline` (refine.js), `listSections` (playground.js), `buildRenderDoc` (public/render-frame.js — Node-importable, verified).
- Produces endpoints (spec table): `POST /api/refinery/launch`, `GET /api/refinery/jobs`, `GET /api/refinery/job`, `POST /api/refinery/stop`, `POST /api/refinery/relaunch`, `POST /api/refinery/approve`, `POST /api/refinery/reject`, `GET /api/refinery/diff?id=`, `GET /api/refinery/events?id=` (SSE), `GET /render/:jobId/:iter/:sectionId`, statics `/runs` + `/repo`.

- [ ] **Step 1: Add imports + wiring in `server.js`**

Imports (with the others):

```js
import { createRefinery } from './lib/refinery.js';
import { getJob as getRefineryJob, listJobs as listRefineryJobs, saveJob as saveRefineryJob, markInterrupted, finalGuideline } from './lib/jobs-store.js';
import { captureSweep } from './lib/capture.js';
import { judgeIteration } from './lib/judge.js';
import { generate as playgroundGenerate } from './lib/playground.js';
import { buildRenderDoc } from './public/render-frame.js';
```

(`refineGuideline`, `listSections`, `readPrompt`, `writePromptRaw`, `computeDiff` are already imported or exported from modules already in the import list — add `writePromptRaw` to the prompts.js import.)

Inside `createApp(rootDir)`, after the `/vendor` mount:

```js
  const RUNS_DIR = join(__dirname, 'runs');
  app.use('/runs', express.static(RUNS_DIR));
  app.use('/repo', express.static(root, { index: false }));   // read-only originals for capture + reference

  const refinery = createRefinery({ runsDir: RUNS_DIR, rootDir: root, deps: {
    listSectionsImpl: listSections,
    generateImpl: playgroundGenerate,
    captureImpl: captureSweep,
    judgeImpl: judgeIteration,
    refineImpl: refineGuideline,
  } });
  // Boot recovery: execution died with the previous process; records survive.
  markInterrupted(RUNS_DIR).catch(() => {});
```

Endpoints (before `return app;`):

```js
  app.post('/api/refinery/launch', async (req, res) => {
    const { promptPaths, sections } = req.body;
    if (!Array.isArray(promptPaths) || !promptPaths.length) return bad(res, 'promptPaths required');
    if (!Array.isArray(sections) || !sections.length) return bad(res, 'sections required');
    if (!(await pingStatus({}))) return bad(res, 'playground not reachable at :5173 — start it first');
    try { res.json(await refinery.launch({ promptPaths: promptPaths.map(String), sections: sections.map(String) })); }
    catch (err) { bad(res, String(err.message || err)); }
  });

  app.get('/api/refinery/jobs', async (req, res) => {
    let jobs = await listRefineryJobs(RUNS_DIR);
    if (req.query.promptPath) jobs = jobs.filter((j) => j.promptPath === String(req.query.promptPath));
    // The list view needs status, not full iteration payloads.
    res.json({ jobs: jobs.map(({ id, promptPath, status, amberReason, createdAt, updatedAt, iterations }) =>
      ({ id, promptPath, status, amberReason, createdAt, updatedAt,
         iters: iterations.length, scores: iterations.map((it) => it.judge?.score ?? null) })) });
  });

  app.get('/api/refinery/job', async (req, res) => {
    const job = await getRefineryJob(RUNS_DIR, String(req.query.id || ''));
    if (!job) return res.status(404).json({ error: 'no such job' });
    res.json(job);
  });

  app.post('/api/refinery/stop', (req, res) => { refinery.stop(String(req.body.id || '')); res.json({ ok: true }); });

  app.post('/api/refinery/relaunch', async (req, res) => {
    try { res.json(await refinery.relaunch(String(req.body.id || ''), { userNotes: req.body.userNotes })); }
    catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/refinery/approve', async (req, res) => {
    try {
      const job = await getRefineryJob(RUNS_DIR, String(req.body.id || ''));
      if (!job) return res.status(404).json({ error: 'no such job' });
      const guideline = finalGuideline(job);
      if (!guideline) return bad(res, 'job has no scored iteration to approve');
      await writePromptRaw(root, job.promptPath, guideline);
      job.status = 'approved';
      await saveRefineryJob(RUNS_DIR, job);
      res.json({ ok: true });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/refinery/reject', async (req, res) => {
    try {
      const job = await getRefineryJob(RUNS_DIR, String(req.body.id || ''));
      if (!job) return res.status(404).json({ error: 'no such job' });
      if (job.status === 'running' || job.status === 'queued') return bad(res, 'stop the job first');
      job.status = 'idle'; job.amberReason = null;
      await saveRefineryJob(RUNS_DIR, job);
      res.json({ ok: true });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.get('/api/refinery/diff', async (req, res) => {
    try {
      const job = await getRefineryJob(RUNS_DIR, String(req.query.id || ''));
      if (!job) return res.status(404).json({ error: 'no such job' });
      const original = await readPrompt(root, job.promptPath);
      const final = finalGuideline(job);
      if (original === null || final === null) return bad(res, 'nothing to diff');
      res.json({ changed: original !== final, parts: computeDiff(original, final) });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.get('/api/refinery/events', (req, res) => {
    const id = String(req.query.id || '');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    const em = refinery.events(id);
    em.on('event', send);
    req.on('close', () => em.off('event', send));
  });

  // Rendered doc for a stored iteration section — used by Playwright capture
  // AND by the UI's live previews (same pixels for both).
  app.get('/render/:jobId/:iter/:sectionId', async (req, res) => {
    try {
      const job = await getRefineryJob(RUNS_DIR, req.params.jobId);
      if (!job) return res.status(404).send('no such job');
      const it = job.iterations.find((x) => x.iter === Number(req.params.iter));
      const sec = it?.sections.find((s) => s.id === req.params.sectionId);
      if (!sec || !sec.config) return res.status(404).send('no such render');
      res.type('html').send(buildRenderDoc({ html: sec.html, css: sec.css, config: sec.config }));
    } catch (err) { res.status(400).send(String(err.message || err)); }
  });
```


- [ ] **Step 2: Append integration tests to `validator/test/server.test.js`**

```js
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
```

- [ ] **Step 3: Run** — `cd validator && node --test test/server.test.js` → PASS. Full suite: `node --test` → all pass.

- [ ] **Step 4: Commit**

```bash
git add validator/server.js validator/test/server.test.js
git commit -m "feat(validator): refinery endpoints, /runs + /repo statics, /render route, boot recovery"
```

---

### Task 8: Refinery UI (status dots, launch sheet, queue widget, job view, approve)

**Files:**
- Modify: `validator/public/index.html` (replace loop markup with job view + launch sheet + queue widget)
- Modify: `validator/public/app.js` (remove manual-loop code; add refinery flows)
- Modify: `validator/public/styles.css`
- Manual smoke (needs playground + server running)

**Interfaces:**
- Consumes: every Task 7 endpoint; `buildRenderDoc` (client-side, for live previews from the stored `{config, html, css}`); existing helpers `$`, `api`, `esc`, `streamSSE`, `appendLog`, activity modal, expand modal, diff modal.
- UI principle (spec): stateless window onto `job.json` — every render re-reads server state; navigation cannot lose anything.

- [ ] **Step 1: Remove the manual loop UI**

In `index.html`: delete the `#loopView` inner markup (`.loop-top`, `#loopGrid`, `#loopFeedback`) and the `#loopBtn`/`#roundsRail` buttons in the fix panel. Keep the `#loopView` container div (renamed usage) — replace with:

```html
    <div id="loopView" hidden>
      <div class="loop-top">
        <div id="jobHead" class="loop-head"></div>
      </div>
      <div id="jobBody" class="loop-grid"></div>
      <div id="jobBar" class="loop-feedback" hidden></div>
    </div>
```

In the fix panel (where `#loopBtn` was):

```html
    <button id="refineSelBtn" class="btn btn-primary btn-block" hidden>Refine selected (<span id="refineCount">0</span>)</button>
    <div id="queueWidget"></div>
```

Add the launch sheet next to the other modals:

```html
  <div id="launchModal" class="modal-backdrop" hidden>
    <div class="modal glass" style="height:auto;max-height:70vh">
      <div class="modal-head"><span>Launch refinement</span>
        <button id="launchClose" class="icon-btn">✕</button></div>
      <div class="launch-body">
        <div id="launchPrompts" class="launch-list"></div>
        <div class="launch-sub">Sections to test on (1–4):</div>
        <div id="launchSections" class="loop-sections" style="position:static;border:0;padding:8px 0"></div>
        <div class="launch-sub">Stop rule: green at score ≥ 8 · max 5 iterations · plateau ×2 → amber</div>
        <button id="launchGo" class="btn btn-primary btn-block">Start</button>
        <div id="launchErr" class="launch-err"></div>
      </div>
    </div>
  </div>
```

In `app.js`: delete `openLoop`, `renderLoopHead`, `loopStatus`, `renderSectionChips`, `cellRender`, `renderGrid`, `setLoopBusy`, `loopGenerate`, `loopRefine`, `loopRefreshRounds`, `renderRounds`, `setFeedbackLocked`, `viewRound`, `backToCurrent`, `openPromptDiff`, and every event handler referencing `loopSections/loopGrid/scoreRange/regenBtn/refineBtn/loopActivityBtn/roundsRail/loopBtn/loopHead`. Keep: expand modal, diff modal, activity modal, `streamSSE`, `appendLog`. Keep `state.loop` removed; add `state.refinery = { jobsByPrompt: {}, sections: [], selected: new Set(), currentJob: null, viewIter: null, es: null }`.

- [ ] **Step 2: Prompt-tree dots + selection (app.js)**

Add a poller + dot renderer. The prompts tree row template (in the existing `renderTree` prompt branch) gains a checkbox and a dot:

```js
// status dot for a prompt: latest job wins.
function promptDot(path) {
  const jobs = state.refinery.jobsByPrompt[path] || [];
  if (!jobs.length) return '';
  const j = jobs[0];
  const cls = { queued: 'q', running: 'run', green: 'ok', amber: 'warn', failed: 'fail', approved: 'done', idle: '' }[j.status] || '';
  const label = j.status === 'running' ? `running · iter ${j.iters}` : j.status;
  return cls ? `<span class="jdot ${cls}" title="${esc(label)}"></span>` : '';
}

async function refreshJobs() {
  try {
    const { jobs } = await api('/api/refinery/jobs');
    const by = {};
    for (const j of jobs) (by[j.promptPath] = by[j.promptPath] || []).push(j);
    state.refinery.jobsByPrompt = by;
    renderQueueWidget(jobs);
    if (state.view === 'prompts') renderTree();
    // live-follow the open job
    const cur = state.refinery.currentJob;
    if (cur && !$('loopView').hidden) {
      const fresh = jobs.find((j) => j.id === cur.id);
      if (fresh && (fresh.status !== cur.status || fresh.iters !== cur.iters)) openJobView(cur.id, { keepIter: true });
    }
  } catch { /* server briefly down */ }
}
setInterval(refreshJobs, 4000);
refreshJobs();
```

In the prompt row template add `<input type="checkbox" class="jcb" data-jp="${esc(f.path)}" ${state.refinery.selected.has(f.path) ? 'checked' : ''}/>` before the name and `${promptDot(f.path)}` after it; wire in the tree click handler (prompts branch):

```js
    if (e.target.classList.contains('jcb')) {
      const p = e.target.dataset.jp;
      if (state.refinery.selected.has(p)) state.refinery.selected.delete(p); else state.refinery.selected.add(p);
      $('refineCount').textContent = state.refinery.selected.size;
      $('refineSelBtn').hidden = state.view !== 'prompts' || !state.refinery.selected.size;
      return;
    }
```

And in `renderPromptView()` set `$('refineSelBtn').hidden = !(state.view === 'prompts' && state.refinery.selected.size);` (replacing the old `loopBtn` visibility line) — and instead of hiding `#loopView` unconditionally, show the job view when the selected prompt has jobs: at the end of `renderPromptView`, `if (state.currentPrompt && (state.refinery.jobsByPrompt[state.currentPrompt] || []).length) { openJobView((state.refinery.jobsByPrompt[state.currentPrompt])[0].id); }`.

- [ ] **Step 3: Launch sheet (app.js)**

```js
async function openLaunch() {
  const { sections } = await api('/api/playground/sections');
  state.refinery.sections = [];
  $('launchPrompts').innerHTML = [...state.refinery.selected].map((p) => `<div class="launch-row">${esc(p)}</div>`).join('');
  $('launchSections').innerHTML = sections.map((s) =>
    `<span class="chip" data-ls="${esc(s.id)}">${esc(s.id)}</span>`).join('');
  $('launchErr').textContent = '';
  $('launchModal').hidden = false;
}
$('refineSelBtn').onclick = openLaunch;
$('launchClose').onclick = () => { $('launchModal').hidden = true; };
$('launchSections').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  const id = chip.dataset.ls;
  const i = state.refinery.sections.indexOf(id);
  if (i >= 0) state.refinery.sections.splice(i, 1);
  else if (state.refinery.sections.length < 4) state.refinery.sections.push(id);
  chip.classList.toggle('on', state.refinery.sections.includes(id));
});
$('launchGo').onclick = async () => {
  if (!state.refinery.sections.length) { $('launchErr').textContent = 'Pick at least one section.'; return; }
  const res = await api('/api/refinery/launch', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ promptPaths: [...state.refinery.selected], sections: state.refinery.sections }) });
  if (res.error) { $('launchErr').textContent = res.error; return; }
  if (res.errors?.length) $('launchErr').textContent = res.errors.map((e) => `${e.promptPath}: ${e.error}`).join(' · ');
  else $('launchModal').hidden = true;
  state.refinery.selected.clear();
  $('refineSelBtn').hidden = true;
  refreshJobs();
};
```

- [ ] **Step 4: Queue widget (app.js)**

```js
function renderQueueWidget(jobs) {
  const act = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  $('queueWidget').innerHTML = !act.length ? '' :
    '<div class="qw-head">Refinery queue</div>' + act.map((j) =>
      `<div class="qw-row" data-job="${j.id}" data-jp="${esc(j.promptPath)}">
        ${j.status === 'running' ? '<span class="spinner"></span>' : '<span class="jdot q"></span>'}
        <span class="qw-name">${esc(j.promptPath.split('/').pop())}</span>
        <span class="qw-st">${j.status === 'running' ? `iter ${Math.max(1, j.iters)}` : 'queued'}</span></div>`).join('');
}
$('queueWidget').addEventListener('click', (e) => {
  const row = e.target.closest('.qw-row'); if (!row) return;
  state.currentPrompt = row.dataset.jp;
  renderTree(); render();
  openJobView(row.dataset.job);
});
```

- [ ] **Step 5: Job view (app.js)** — the heart of it. Everything renders from a fresh `GET /api/refinery/job`.

```js
const STATUS_BADGE = {
  queued:   ['Queued', ''], running: ['Running', ''], green: ['Green — review & approve', 'ok'],
  amber:    ['Amber — needs attention', 'history'], failed: ['Failed', 'history'],
  approved: ['Approved ✓', 'ok'], idle: ['Idle', ''],
};

async function openJobView(jobId, { keepIter } = {}) {
  const job = await api(`/api/refinery/job?id=${encodeURIComponent(jobId)}`);
  if (job.error) return;
  state.refinery.currentJob = job;
  if (!keepIter) state.refinery.viewIter = null;
  $('markdown').hidden = true; $('code').hidden = true; $('preview').hidden = true; $('diff').hidden = true;
  $('placeholder').hidden = true; $('loopView').hidden = false;
  renderJobView(job);
  subscribeJob(job);
}

function renderJobView(job) {
  const [label, cls] = STATUS_BADGE[job.status] || [job.status, ''];
  const scores = job.iterations.map((it) => it.judge?.score ?? '×');
  const viewIter = state.refinery.viewIter ?? job.iterations.length;
  // header: badge, score trail, iteration chips, actions
  $('jobHead').innerHTML = `
    <span class="round-badge ${cls}">${esc(label)}${job.amberReason ? ` · ${esc(job.amberReason)}` : ''}</span>
    <span class="loop-sub">${esc(job.promptPath)} · iter ${job.iterations.length}/${job.stop.maxIters}
      ${scores.length ? '· scores ' + scores.join(' → ') : ''}</span>
    <span class="iter-chips">${job.iterations.map((it) =>
      `<button class="iter-chip ${it.iter === viewIter ? 'on' : ''}" data-iter="${it.iter}">${it.iter}</button>`).join('')}</span>
    <span id="loopStatus" class="loop-status"></span>
    ${job.status === 'running' ? '<button id="jobStopBtn" class="btn btn-ghost btn-mini">Stop after iteration</button>' : ''}
    <button id="jobActivityBtn" class="btn btn-ghost btn-mini">◧ Activity</button>`;
  // body: the viewed iteration
  const it = job.iterations.find((x) => x.iter === viewIter);
  if (!it) {
    $('jobBody').innerHTML = `<div class="loop-empty">${job.status === 'queued' ? 'Waiting in the queue…' : 'No iterations yet — generating…'}</div>`;
  } else {
    const judgeBlock = it.judge?.error ? `<div class="err">judge failed: ${esc(it.judge.error)}</div>`
      : it.judge ? `<div class="judge-note"><b>${it.judge.score}/10</b> — ${esc(it.judge.notes)}</div>` : '';
    $('jobBody').innerHTML = judgeBlock + it.sections.map((s) => {
      const issues = (it.judge?.sections || []).find((x) => x.id === s.id)?.issues || [];
      const inner = s.error ? `<div class="err">${esc(s.error)}</div>`
        : `<iframe sandbox="allow-scripts" src="/render/${job.id}/${it.iter}/${encodeURIComponent(s.id)}"></iframe>`;
      return `<div class="loop-cell"><div class="cap"><span class="cap-id">${esc(s.id)}</span>
        ${s.error ? '' : `<button class="cap-expand" data-xj="${job.id}" data-xi="${it.iter}" data-xs="${esc(s.id)}" title="Expand">⛶</button>`}</div>
        ${inner}${issues.length ? `<div class="cell-issues">${issues.map((i) => `· ${esc(i)}`).join('<br>')}</div>` : ''}</div>`;
    }).join('');
  }
  // bottom bar: approve flow / relaunch with notes
  const done = ['green', 'amber', 'failed', 'idle'].includes(job.status);
  $('jobBar').hidden = !done;
  if (done) {
    $('jobBar').innerHTML = `
      <textarea id="jobNotes" placeholder="Optional guidance for the next run (rides into the refine step)"></textarea>
      <div class="loop-actions">
        ${job.status !== 'failed' && job.iterations.length ? '<button id="jobApprove" class="btn btn-primary">Approve (write .md)</button>' : ''}
        <button id="jobRelaunch" class="btn">Relaunch</button>
        ${job.iterations.length ? '<button id="jobDiffBtn" class="btn btn-ghost btn-mini">Δ Prompt diff</button>' : ''}
        ${job.status !== 'idle' && job.status !== 'failed' ? '<button id="jobReject" class="btn btn-ghost btn-mini">Reject (keep history)</button>' : ''}
      </div>`;
  }
}

// Live previews use src=/render/... (session-cookie-free, CORS-safe: same origin,
// sandboxed like the old grid). Expanded view reuses the same URL.
$('jobBody').addEventListener('click', (e) => {
  const x = e.target.closest('[data-xj]'); if (!x) return;
  $('expandTitle').textContent = `${x.dataset.xs} · iteration ${x.dataset.xi}`;
  $('expandFrame').removeAttribute('srcdoc');
  $('expandFrame').src = `/render/${x.dataset.xj}/${x.dataset.xi}/${encodeURIComponent(x.dataset.xs)}`;
  $('expandModal').hidden = false;
});

$('jobHead').addEventListener('click', async (e) => {
  const chip = e.target.closest('.iter-chip');
  if (chip) { state.refinery.viewIter = Number(chip.dataset.iter); renderJobView(state.refinery.currentJob); return; }
  if (e.target.id === 'jobStopBtn') {
    await api('/api/refinery/stop', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: state.refinery.currentJob.id }) });
    document.getElementById('loopStatus').textContent = 'Will stop after the current iteration.';
  }
  if (e.target.id === 'jobActivityBtn') openActivity();
});

$('jobBar').addEventListener('click', async (e) => {
  const job = state.refinery.currentJob; if (!job) return;
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (e.target.id === 'jobApprove') {
    const r = await post('/api/refinery/approve', { id: job.id });
    document.getElementById('loopStatus').textContent = r.error || 'Approved — guideline written to the .md.';
    refreshJobs(); openJobView(job.id);
  } else if (e.target.id === 'jobRelaunch') {
    const notes = document.getElementById('jobNotes')?.value || '';
    const r = await post('/api/refinery/relaunch', { id: job.id, userNotes: notes || undefined });
    document.getElementById('loopStatus').textContent = r.error || 'Relaunched.';
    refreshJobs(); openJobView(job.id);
  } else if (e.target.id === 'jobReject') {
    const r = await post('/api/refinery/reject', { id: job.id });
    document.getElementById('loopStatus').textContent = r.error || 'Rejected — history kept.';
    refreshJobs(); openJobView(job.id);
  } else if (e.target.id === 'jobDiffBtn') {
    const d = await api(`/api/refinery/diff?id=${encodeURIComponent(job.id)}`);
    $('diffTitle').textContent = `Original .md → job's best guideline`;
    $('diffBody').innerHTML = d.error ? `<span>${esc(d.error)}</span>`
      : !d.changed ? '<div style="color:var(--text-3);padding:8px">No differences.</div>'
      : d.parts.map((p) => p.added ? `<ins>${esc(p.value)}</ins>` : p.removed ? `<del>${esc(p.value)}</del>` : `<span>${esc(p.value)}</span>`).join('');
    $('diffModal').hidden = false;
  }
});

// SSE: stream logs into the activity modal; refresh the view on step/status.
function subscribeJob(job) {
  state.refinery.es?.close();
  if (job.status !== 'running' && job.status !== 'queued') { state.refinery.es = null; return; }
  const es = new EventSource(`/api/refinery/events?id=${encodeURIComponent(job.id)}`);
  state.refinery.es = es;
  es.addEventListener('log', (e) => { const d = JSON.parse(e.data); appendLog(job.promptPath, d.text); });
  es.addEventListener('step', (e) => { const d = JSON.parse(e.data);
    const el = document.getElementById('loopStatus'); if (el) el.textContent = `iter ${d.iter} · ${d.step}…`; });
  es.addEventListener('iteration', () => openJobView(job.id, { keepIter: false }));
  es.addEventListener('status', () => { refreshJobs(); openJobView(job.id, { keepIter: true }); });
  es.addEventListener('end', () => { es.close(); state.refinery.es = null; });
}
```

Note: `subscribeJob` uses native `EventSource` (GET SSE) — simpler than `streamSSE` here and reconnects free.

- [ ] **Step 6: Styles (append to styles.css)**

```css
/* ── Refinery ─────────────────────────────────────── */
.jdot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.jdot.q { background: var(--text-3); } .jdot.run { background: var(--accent); animation: livepulse 1.3s ease-out infinite; }
.jdot.ok { background: var(--c-clean); } .jdot.warn { background: var(--c-outdated); }
.jdot.fail { background: var(--c-nointeract); } .jdot.done { background: var(--c-clean); box-shadow: 0 0 0 2px rgba(52,211,153,.25); }
.jcb { accent-color: var(--accent); }
.qw-head { font-size: 11px; font-weight: 600; letter-spacing: .03em; color: var(--text-3); text-transform: uppercase; margin: 10px 0 4px; }
.qw-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 6px 8px; border-radius: var(--radius-xs); background: var(--fill-1); cursor: pointer; margin-bottom: 4px; }
.qw-row:hover { background: var(--fill-2); }
.qw-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qw-st { margin-left: auto; color: var(--text-3); font-size: 11px; }
.iter-chips { display: inline-flex; gap: 4px; }
.iter-chip { width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--hair); background: var(--fill-1); color: var(--text-2); font-size: 11px; cursor: pointer; }
.iter-chip.on { background: var(--accent-soft); border-color: var(--accent); color: #fff; }
.judge-note { font-size: 12.5px; color: var(--text-2); background: var(--fill-1); border: 1px solid var(--hair); border-radius: var(--radius-xs); padding: 10px 12px; line-height: 1.5; }
.judge-note b { color: var(--text); }
.cell-issues { font-size: 11.5px; color: #fdba74; padding: 8px 12px; border-top: 1px solid var(--hair); line-height: 1.6; }
.launch-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.launch-list { display: flex; flex-direction: column; gap: 4px; }
.launch-row { font-size: 12px; font-family: var(--mono); color: var(--text-2); background: var(--fill-1); border-radius: var(--radius-xs); padding: 6px 9px; }
.launch-sub { font-size: 11.5px; color: var(--text-3); }
.launch-err { color: #fca5a5; font-size: 12px; min-height: 16px; }
#jobBar textarea { flex: 1; min-height: 52px; background: var(--fill-1); border: 1px solid var(--hair); border-radius: var(--radius-xs); color: var(--text); padding: 9px 11px; font-family: inherit; font-size: 12.5px; resize: none; }
```

- [ ] **Step 7: Suite green + syntax check**

Run: `cd validator && node --check public/app.js && node --test` — Expected: syntax OK, all tests pass.

- [ ] **Step 8: Manual smoke (needs playground on :5173 + `npm start`, user-driven)**

1. Prompts tab → check 1–2 prompts → **Refine selected** → pick 2 sections → **Start**.
2. Watch: tree dots pulse; queue widget shows both; job view streams step + judge/refiner reasoning in the Activity modal; iteration chips appear as iterations complete with the score trail updating.
3. When green/amber: click iteration chips to compare; expand a preview; **Δ Prompt diff**; **Approve** → confirm the `.md` changed (Prompts → Raw); or add notes → **Relaunch**.
4. Restart the server mid-run → job shows amber `interrupted` → **Relaunch** resumes from the last iteration.

- [ ] **Step 9: Commit**

```bash
git add validator/public/index.html validator/public/app.js validator/public/styles.css
git commit -m "feat(validator): refinery UI — status dots, launch sheet, queue widget, job view, approve flow"
```

---

## Self-Review Notes

- **Spec coverage:** jobs store + boot recovery (T1) ✔; stop rule/plateau/history/triggers (T2) ✔; Playwright capture frames+GIF + v1 hover limitation (T3, judge told triggers in T4 prompt) ✔; vision judge with Read tool, rubric, strict JSON + one retry (T4) ✔; refine memory + userNotes (T5) ✔; queue of 2, per-step persistence, resume-from-last-iteration, stop-after-iteration, per-section generate isolation, amber reasons (T6) ✔; all spec endpoints + `/runs` `/repo` statics + `/render` + SSE + approve-writes-md (T7) ✔; UI dots/launch/queue/job-view/live-preview approve + stateless-window principle + retired manual loop (T8) ✔; playground-down check at launch (T7) ✔.
- **Intentional deviations:** no `runs/index.json` (scan instead — noted in Global Constraints); `GET /api/refinery/events` is GET-based SSE via native EventSource (spec's Accept-header rule applies to POST SSE endpoints; a GET event stream is the standard EventSource contract).
- **Type consistency check:** job record shape identical across T1/T6/T7/T8 (`iterations[].{iter,guideline,sections[].{id,config,html,css,frames,gif,error},judge{score,notes,sections}|{error},refined}`); `decide`/`historyBlock` signatures match T2↔T6; `captureImpl(url, outDir) -> {frames,gif}` matches T3↔T6; `judgeImpl(inputs, {addDir,onDelta}) -> {score,notes,sections}` matches T4↔T6; `refineImpl({guideline,score,notes,history,userNotes,onDelta}) -> string` matches T5↔T6; `finalGuideline` used by approve+diff (T1↔T7).
- **Known risk for implementers:** Task 6's engine captures via `http://localhost:<port>/render/...` — the server must be running for REAL jobs (T7 wires the port), but engine TESTS never hit HTTP (captureImpl faked). The self-start port default (4500) matches `createRefinery`'s default.
