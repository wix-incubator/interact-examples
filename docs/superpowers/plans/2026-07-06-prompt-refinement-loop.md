# Prompt Refinement Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generate→review→refine loop to the validator: run a prompt guideline against several playground sections, render the results, score+note them, and have an agent iteratively refine the *general* guideline until finalized.

**Architecture:** The validator backend calls the interact-xp playground's `/api/generate` (localhost:5173) per section to get an Experience config, then the validator UI renders each config in an iframe using a **bundled copy** of `@wix/interact-experience-renderer`. An agent rewrites the guideline from holistic score+notes; full round history is kept beside the prompt.

**Tech Stack:** Node 18+ ESM, Express, `esbuild` (new devDep, bundles the read-only interact-xp source into the validator), the local `claude` CLI (existing `runAgent`), Node's `node:test`.

## Global Constraints

- **interact-xp is READ-ONLY.** Never create/edit/delete/move any path under `PLAYGROUND_REPO`; never run a command with it as cwd; never build/install/checkout there. Allowed: read files, import its already-built `dist`, esbuild reading its source while writing output **into `validator/`**, and HTTP to the dev server the user runs. All generated artifacts live under `validator/vendor/`.
- `PLAYGROUND_REPO` default `~/Documents/Dev/Wix/interact-xp`; `PLAYGROUND_URL` default `http://localhost:5173`. Both overridable via env.
- Guideline → `userPromptExample`; fixed instruction → `userPrompt`. `/api/generate` body: `{ user_input, system_rules }`. Response: `{ config, sessionId }` (config is Experience JSON, not HTML).
- Prompt/history paths are scoped to `Ani-Mate Prompts/` (constant `PROMPTS_DIR = 'Ani-Mate Prompts'`); reuse the path-safety guards in `lib/prompts.js`.
- All new code under `validator/`; ESM; `"type": "module"`; tests run with `node --test`.
- SSE endpoints opt in via `Accept: text/event-stream` (mirror `/api/fix`): emit `event: start|result|log|done|error`.
- Do NOT modify `explorer.html` or `analysis/`.

---

### Task 1: Vendor build — bundle the renderer + emit the schema (SPIKE / GATE)

**Files:**
- Modify: `validator/package.json` (add `esbuild` devDep + `build:vendor` script)
- Create: `validator/scripts/build-vendor.mjs`
- Create (generated, committed): `validator/vendor/render-runtime.js`, `validator/vendor/experience.schema.json`
- Create: `validator/vendor/.gitignore` (none — we DO commit these)

**Interfaces:**
- Produces: `validator/vendor/render-runtime.js` — a browser ESM bundle exporting `createExperience` (and whatever `@wix/interact-experience-renderer` exports). `validator/vendor/experience.schema.json` — the `EXPERIENCE_SCHEMA` JSON.

> This task is the feasibility GATE. If esbuild cannot bundle the renderer or emit the schema after reasonable effort, STOP and escalate to the human (fallback per spec: browser automation). Do not hack around it silently.

- [ ] **Step 1: Add esbuild to the validator (NOT to interact-xp)**

Run: `cd /Users/hassank/interact-examples/interact-examples/validator && npm install --save-dev esbuild`
Expected: esbuild added under `validator/node_modules`; `validator/package.json` devDependencies has `esbuild`.

- [ ] **Step 2: Write the vendor build script**

```js
// validator/scripts/build-vendor.mjs
import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const XP = process.env.PLAYGROUND_REPO || join(homedir(), 'Documents/Dev/Wix/interact-xp');
const OUT = new URL('../vendor/', import.meta.url).pathname;

async function buildRenderRuntime() {
  await build({
    entryPoints: [join(XP, 'packages/interact-experience-renderer/src/index.ts')],
    bundle: true, format: 'esm', platform: 'browser',
    outfile: join(OUT, 'render-runtime.js'),
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info',
  });
  console.log('✓ render-runtime.js');
}

async function emitSchema() {
  const tmp = join(tmpdir(), `iv-schema-${process.pid}.mjs`);
  await build({
    entryPoints: [join(XP, 'apps/playground/src/lib/schema.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'info',
  });
  const mod = await import(pathToFileURL(tmp).href);
  await writeFile(join(OUT, 'experience.schema.json'), JSON.stringify(mod.EXPERIENCE_SCHEMA, null, 2));
  await rm(tmp, { force: true });
  console.log('✓ experience.schema.json');
}

await mkdir(OUT, { recursive: true });
await buildRenderRuntime();
await emitSchema();
console.log('vendor build complete');
```

- [ ] **Step 3: Add the npm script**

In `validator/package.json` `"scripts"`, add: `"build:vendor": "node scripts/build-vendor.mjs"`.

- [ ] **Step 4: Run the vendor build (GATE)**

Run: `cd validator && npm run build:vendor`
Expected: prints `✓ render-runtime.js`, `✓ experience.schema.json`, `vendor build complete`; both files exist under `validator/vendor/`. `experience.schema.json` is a JSON object with a top-level `$schema`/`properties` (a JSON Schema). `render-runtime.js` contains `createExperience`.
If esbuild errors on unresolved imports or TS: attempt fixes limited to esbuild options (e.g. `tsconfig`, `mainFields`, `conditions: ['module','import','default']`, `loader`). If it still fails → STOP, report the exact error, escalate.

- [ ] **Step 5: Manually verify the render runtime applies a config**

Create a throwaway HTML file `validator/vendor/_smoke.html`:

```html
<!doctype html><body>
<div id="root"><div class="card">hi</div></div>
<script type="module">
  import { createExperience } from './render-runtime.js';
  window.__ok = typeof createExperience === 'function';
  document.body.dataset.smoke = window.__ok ? 'ok' : 'fail';
</script>
</body>
```

Run: `cd validator && PORT=4790 node server.js &` then `sleep 1 && curl -s localhost:4790/vendor/_smoke.html | grep -c createExperience` (serves via existing static). Expected: `1`. (A deeper pixel check happens in the Task 6 manual smoke.) Then `rm validator/vendor/_smoke.html` and kill the server.

- [ ] **Step 6: Commit**

```bash
git add validator/package.json validator/package-lock.json validator/scripts/build-vendor.mjs validator/vendor/render-runtime.js validator/vendor/experience.schema.json
git commit -m "feat(validator): vendor build — bundle interact-experience renderer + schema"
```

---

### Task 2: Constants + playground client (`playground.js`)

**Files:**
- Modify: `validator/lib/constants.js`
- Create: `validator/lib/playground.js`
- Test: `validator/test/playground.test.js`

**Interfaces:**
- Consumes: `buildGenerate` (dynamic import from `<PLAYGROUND_REPO>/packages/interact-experience-prompt/dist/es/index.js`); vendored `validator/vendor/experience.schema.json`.
- Produces:
  - `PLAYGROUND_REPO`, `PLAYGROUND_URL`, `SECTION_INSTRUCTION` (constants.js).
  - `assemblePayload({ buildGenerate, schema, html, css, guideline }) -> { user_input, system_rules }` (pure).
  - `listSections(sectionsDir?) -> Promise<Array<{ id, html, css }>>`.
  - `buildPayload({ html, css, guideline }) -> Promise<{ user_input, system_rules }>`.
  - `generate({ html, css, guideline }, { playgroundUrl?, fetchImpl? }) -> Promise<{ config, sessionId }>`.
  - `pingStatus({ playgroundUrl?, fetchImpl? }) -> Promise<boolean>`.

- [ ] **Step 1: Add constants**

In `validator/lib/constants.js` append:

```js
import { homedir } from 'node:os';
import { join } from 'node:path';

export const PLAYGROUND_REPO = process.env.PLAYGROUND_REPO || join(homedir(), 'Documents/Dev/Wix/interact-xp');
export const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'http://localhost:5173';
export const SECTION_INSTRUCTION =
  'Apply the animation pattern described in the example to this section. Follow its Selector Contract and Interact Template, adapting the roles to this section’s DOM. Return only the experience config.';
```

- [ ] **Step 2: Write the failing tests**

```js
// validator/test/playground.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assemblePayload, listSections, generate, pingStatus } from '../lib/playground.js';

test('assemblePayload routes guideline→userPromptExample, instruction→userPrompt, embeds schema', () => {
  const calls = [];
  const buildGenerate = (args) => { calls.push(args); return { system: 'SYS', user: 'USR' }; };
  const out = assemblePayload({ buildGenerate, schema: { s: 1 }, html: '<h>', css: 'c', guideline: 'GUIDE' });
  assert.deepEqual(out, { user_input: 'USR', system_rules: 'SYS' });
  assert.equal(calls[0].userPromptExample, 'GUIDE');
  assert.equal(calls[0].html, '<h>');
  assert.equal(calls[0].css, 'c');
  assert.deepEqual(calls[0].schema, { s: 1 });
  assert.match(calls[0].userPrompt, /Apply the animation pattern/);
});

test('listSections reads section html/css (sanitized preferred)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'iv-sec-'));
  await mkdir(join(dir, 'cards'), { recursive: true });
  await writeFile(join(dir, 'cards', 'section.html'), '<raw>');
  await writeFile(join(dir, 'cards', 'section.sanitized.html'), '<clean>');
  await writeFile(join(dir, 'cards', 'section.css'), '.c{}');
  await mkdir(join(dir, 'hero'), { recursive: true });
  await writeFile(join(dir, 'hero', 'section.html'), '<hero>');
  const secs = await listSections(dir);
  const cards = secs.find((s) => s.id === 'cards');
  assert.equal(cards.html, '<clean>');   // sanitized preferred
  assert.equal(cards.css, '.c{}');
  const hero = secs.find((s) => s.id === 'hero');
  assert.equal(hero.html, '<hero>');
  assert.equal(hero.css, '');             // missing css → empty
});

test('generate POSTs the payload and returns config+sessionId', async () => {
  const fetchImpl = async (url, opts) => {
    assert.match(url, /\/api\/generate$/);
    const body = JSON.parse(opts.body);
    assert.ok(body.user_input && body.system_rules);
    return { ok: true, json: async () => ({ config: '{"x":1}', sessionId: 'sess1' }) };
  };
  const out = await generate({ html: '<h>', css: 'c', guideline: 'g' },
    { playgroundUrl: 'http://x', fetchImpl, buildGenerateImpl: () => ({ system: 'S', user: 'U' }), schemaImpl: {} });
  assert.deepEqual(out, { config: '{"x":1}', sessionId: 'sess1' });
});

test('pingStatus is false when the server is unreachable', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  assert.equal(await pingStatus({ playgroundUrl: 'http://127.0.0.1:59999', fetchImpl }), false);
});
```

- [ ] **Step 2b: Run to verify failure**

Run: `cd validator && node --test test/playground.test.js`
Expected: FAIL — `Cannot find module '../lib/playground.js'`.

- [ ] **Step 3: Implement `validator/lib/playground.js`**

```js
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLAYGROUND_REPO, PLAYGROUND_URL, SECTION_INSTRUCTION } from './constants.js';

const SECTIONS_DIR = join(PLAYGROUND_REPO, 'apps/playground/src/sections');
const PROMPT_DIST = join(PLAYGROUND_REPO, 'packages/interact-experience-prompt/dist/es/index.js');
const SCHEMA_PATH = new URL('../vendor/experience.schema.json', import.meta.url);

// Pure: given the playground's buildGenerate + schema, produce the request body.
export function assemblePayload({ buildGenerate, schema, html, css, guideline }) {
  const prompt = buildGenerate({ html, css, userPrompt: SECTION_INSTRUCTION, userPromptExample: guideline, schema });
  return { user_input: prompt.user, system_rules: prompt.system };
}

export async function listSections(sectionsDir = SECTIONS_DIR) {
  let entries;
  try { entries = await readdir(sectionsDir, { withFileTypes: true }); }
  catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(sectionsDir, e.name);
    const read = async (f) => { try { return await readFile(join(dir, f), 'utf8'); } catch { return null; } };
    const html = (await read('section.sanitized.html')) ?? (await read('section.html'));
    if (html === null) continue;
    out.push({ id: e.name, html, css: (await read('section.css')) ?? '' });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function loadBuildGenerate() {
  const mod = await import(pathToFileURL(PROMPT_DIST).href);
  return mod.buildGenerate;
}
async function loadSchema() {
  return JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
}

export async function buildPayload({ html, css, guideline }) {
  const [buildGenerate, schema] = await Promise.all([loadBuildGenerate(), loadSchema()]);
  return assemblePayload({ buildGenerate, schema, html, css, guideline });
}

export async function generate({ html, css, guideline },
  { playgroundUrl = PLAYGROUND_URL, fetchImpl = fetch, buildGenerateImpl, schemaImpl } = {}) {
  const buildGenerate = buildGenerateImpl || (await loadBuildGenerate());
  const schema = schemaImpl || (await loadSchema());
  const body = assemblePayload({ buildGenerate, schema, html, css, guideline });
  const res = await fetchImpl(`${playgroundUrl}/api/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`playground /api/generate returned ${res.status}`);
  const data = await res.json();
  return { config: data.config, sessionId: data.sessionId };
}

export async function pingStatus({ playgroundUrl = PLAYGROUND_URL, fetchImpl = fetch } = {}) {
  try { const res = await fetchImpl(playgroundUrl, { method: 'GET' }); return !!res && (res.ok || res.status < 500); }
  catch { return false; }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd validator && node --test test/playground.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add validator/lib/constants.js validator/lib/playground.js validator/test/playground.test.js
git commit -m "feat(validator): playground client (sections, payload, generate, status)"
```

---

### Task 3: Loop history store (`loop-store.js`) + raw prompt writer

**Files:**
- Modify: `validator/lib/prompts.js` (add `writePromptRaw`)
- Create: `validator/lib/loop-store.js`
- Test: `validator/test/loop-store.test.js`

**Interfaces:**
- Consumes: `readPrompt`, `writePromptRaw` from `prompts.js`; `PROMPTS_DIR` from constants.
- Produces:
  - `writePromptRaw(rootDir, promptRel, content) -> Promise<void>` (writes `PROMPTS_DIR/promptRel`, path-safe).
  - `readLoop(rootDir, promptRel) -> Promise<{ working, rounds }>` — `working` defaults to the prompt's current `.md` text, `rounds` defaults to `[]`.
  - `recordRound(rootDir, promptRel, { guideline, sections, score, notes, newWorking }) -> Promise<{ round }>`.
  - `rollback(rootDir, promptRel, round) -> Promise<{ working }>`.
  - `finalize(rootDir, promptRel) -> Promise<void>` — writes `working` to the prompt's `.md`.
  - Round shape: `{ round: number, guideline: string, sections: [{ id, config }], score: number, notes: string }`.

- [ ] **Step 1: Add `writePromptRaw` to `prompts.js`**

In `validator/lib/prompts.js`, after `readPrompt`, add (reusing the existing private `promptAbs` + `mkdir`/`dirname` already imported):

```js
export async function writePromptRaw(rootDir, rel, content) {
  const abs = promptAbs(rootDir, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
}
```

(If `mkdir`/`dirname`/`writeFile` aren't already imported in prompts.js, add them to its `node:fs/promises` / `node:path` imports — `writePrompt` already uses them, so they are.)

- [ ] **Step 2: Write the failing tests**

```js
// validator/test/loop-store.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePrompt, readPrompt } from '../lib/prompts.js';
import { readLoop, recordRound, rollback, finalize } from '../lib/loop-store.js';

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
```

- [ ] **Step 2b: Run to verify failure**

Run: `cd validator && node --test test/loop-store.test.js`
Expected: FAIL — `Cannot find module '../lib/loop-store.js'`.

- [ ] **Step 3: Implement `validator/lib/loop-store.js`**

```js
import { readPrompt, writePromptRaw } from './prompts.js';

const historyRel = (promptRel) => `${promptRel}.history.json`;

export async function readLoop(rootDir, promptRel) {
  const raw = await readPrompt(rootDir, historyRel(promptRel));
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      return { working: parsed.working, rounds: parsed.rounds || [] };
    } catch { /* fall through to defaults */ }
  }
  const md = await readPrompt(rootDir, promptRel);
  return { working: md ?? '', rounds: [] };
}

async function save(rootDir, promptRel, loop) {
  await writePromptRaw(rootDir, historyRel(promptRel), JSON.stringify(loop, null, 2));
}

export async function recordRound(rootDir, promptRel, { guideline, sections, score, notes, newWorking }) {
  const loop = await readLoop(rootDir, promptRel);
  const round = loop.rounds.length + 1;
  loop.rounds.push({ round, guideline, sections: sections || [], score, notes });
  loop.working = newWorking;
  await save(rootDir, promptRel, loop);
  return { round };
}

export async function rollback(rootDir, promptRel, round) {
  const loop = await readLoop(rootDir, promptRel);
  const target = loop.rounds.find((r) => r.round === round);
  if (!target) throw new Error(`no round ${round}`);
  loop.working = target.guideline;
  await save(rootDir, promptRel, loop);
  return { working: loop.working };
}

export async function finalize(rootDir, promptRel) {
  const loop = await readLoop(rootDir, promptRel);
  await writePromptRaw(rootDir, promptRel, loop.working);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd validator && node --test test/loop-store.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add validator/lib/prompts.js validator/lib/loop-store.js validator/test/loop-store.test.js
git commit -m "feat(validator): loop history store (rounds, rollback, finalize)"
```

---

### Task 4: Guideline refiner (`refine.js`)

**Files:**
- Create: `validator/lib/refine.js`
- Test: `validator/test/refine.test.js`

**Interfaces:**
- Consumes: `runAgent` from `agent.js` (injectable for tests).
- Produces:
  - `buildRefinePrompt({ guideline, score, notes }) -> { system, user }`.
  - `refineGuideline({ guideline, score, notes, onDelta, runAgent }) -> Promise<string>` (fence-stripped markdown).

- [ ] **Step 1: Write the failing tests**

```js
// validator/test/refine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRefinePrompt, refineGuideline } from '../lib/refine.js';

test('buildRefinePrompt forbids overfitting and embeds score+notes+guideline', () => {
  const { system, user } = buildRefinePrompt({ guideline: '# G', score: 6, notes: 'more spread' });
  assert.match(system, /general/i);
  assert.match(system, /do not overfit|not overfit/i);
  assert.match(system, /ONLY the (full )?updated guideline/i);
  assert.match(user, /6\/10/);
  assert.match(user, /more spread/);
  assert.match(user, /# G/);
});

test('refineGuideline returns fence-stripped markdown from the agent', async () => {
  const out = await refineGuideline({ guideline: '# G', score: 5, notes: 'n',
    runAgent: async () => '```markdown\n# G v2\nbody\n```' });
  assert.equal(out, '# G v2\nbody');
});

test('refineGuideline passes an onDelta through to runAgent', async () => {
  let sawOpts = null;
  await refineGuideline({ guideline: '# G', score: 5, notes: 'n', onDelta: () => {},
    runAgent: async (s, u, opts) => { sawOpts = opts; return '# ok'; } });
  assert.equal(typeof sawOpts.onDelta, 'function');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd validator && node --test test/refine.test.js`
Expected: FAIL — `Cannot find module '../lib/refine.js'`.

- [ ] **Step 3: Implement `validator/lib/refine.js`**

```js
import { runAgent as realRunAgent } from './agent.js';

const SYSTEM = `You refine a GENERAL @wix/interact animation guideline based on holistic, cross-section feedback from a reviewer who applied it to several different sections.

RULES:
- The guideline must stay GENERAL and reusable across many sections. Do NOT overfit to any single generated output or section.
- Keep every section of the guideline intact and general (Summary, Selector Contract, Role Guidance, Adaptation Notes, Required Elements, Required Styles, Suggested Controls, Interact Template).
- Improve it to address the feedback at the pattern level — adjust roles, formulas, adaptation notes, controls, or the interact template as needed.

OUTPUT CONTRACT: Return ONLY the full updated guideline as raw markdown — no code fence around the whole document, no preamble, no commentary. Begin with the "# " H1.`;

function stripFence(text) {
  const t = String(text).trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return (m ? m[1] : t).trim();
}

export function buildRefinePrompt({ guideline, score, notes }) {
  const user = `Reviewer score: ${score}/10

Reviewer notes (holistic, not specific to one output):
${notes || '(none)'}

Current guideline to improve:
${guideline}`;
  return { system: SYSTEM, user };
}

export async function refineGuideline({ guideline, score, notes, onDelta, model, runAgent = realRunAgent }) {
  const { system, user } = buildRefinePrompt({ guideline, score, notes });
  return stripFence(await runAgent(system, user, { model, onDelta }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd validator && node --test test/refine.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add validator/lib/refine.js validator/test/refine.test.js
git commit -m "feat(validator): guideline refiner (general, no-overfit)"
```

---

### Task 5: Server endpoints + serve vendor

**Files:**
- Modify: `validator/server.js`
- Test: `validator/test/server.test.js` (append)

**Interfaces:**
- Consumes: everything from Tasks 2–4; `listPrompts`/`readPrompt` (existing).
- Produces endpoints:
  - `GET /api/playground/status` → `{ up }`
  - `GET /api/playground/sections` → `{ sections: [{ id }] }`
  - `GET /api/loop?promptPath=` → `{ working, rounds }`
  - `POST /api/loop/run` `{ promptPath, sections }` → SSE (`start`/`result {id,config|error}`/`log`/`done`) using the loop's **working** guideline
  - `POST /api/loop/refine` `{ promptPath, score, notes, sections, configs }` → SSE (`log`/`done {guideline}`); records the round
  - `POST /api/loop/finalize` `{ promptPath }` → `{ ok: true }`
  - Static: `validator/vendor/` served at `/vendor/`.

- [ ] **Step 1: Add imports + static mount + endpoints in `server.js`**

Add imports near the others:

```js
import { listSections, generate, pingStatus } from './lib/playground.js';
import { readLoop, recordRound, rollback, finalize } from './lib/loop-store.js';
import { refineGuideline } from './lib/refine.js';
import { readPrompt } from './lib/prompts.js';
```

After the existing `express.static(join(__dirname, 'public'))` line, add:

```js
  app.use('/vendor', express.static(join(__dirname, 'vendor')));
```

Before `return app;`, add:

```js
  app.get('/api/playground/status', async (_req, res) => { res.json({ up: await pingStatus({}) }); });

  app.get('/api/playground/sections', async (_req, res) => {
    const sections = await listSections();
    res.json({ sections: sections.map((s) => ({ id: s.id })) });
  });

  app.get('/api/loop', async (req, res) => {
    try { res.json(await readLoop(root, String(req.query.promptPath))); }
    catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/loop/run', async (req, res) => {
    const { promptPath, sections } = req.body;
    if (!promptPath || !Array.isArray(sections) || !sections.length) return bad(res, 'promptPath and sections required');
    const { working } = await readLoop(root, promptPath);
    const all = await listSections();
    const chosen = all.filter((s) => sections.includes(s.id));
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('start', { sections: chosen.map((s) => s.id) });
    await Promise.all(chosen.map(async (s) => {
      try {
        const { config } = await generate({ html: s.html, css: s.css, guideline: working });
        send('result', { id: s.id, config, html: s.html, css: s.css });
      } catch (err) {
        send('result', { id: s.id, error: String(err.message || err) });
      }
    }));
    send('done', { ok: true });
    res.end();
  });

  app.post('/api/loop/refine', async (req, res) => {
    const { promptPath, score, notes, sections, configs } = req.body;
    if (!promptPath) return bad(res, 'promptPath required');
    const { working } = await readLoop(root, promptPath);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const guideline = await refineGuideline({ guideline: working, score, notes, onDelta: (t) => send('log', { text: t }) });
      await recordRound(root, promptPath, { guideline: working, sections: configs || [], score, notes, newWorking: guideline });
      send('done', { guideline });
    } catch (err) { send('error', { error: String(err.message || err) }); }
    res.end();
  });

  app.post('/api/loop/finalize', async (req, res) => {
    try { await finalize(root, String(req.body.promptPath)); res.json({ ok: true }); }
    catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/loop/rollback', async (req, res) => {
    try { res.json(await rollback(root, String(req.body.promptPath), Number(req.body.round))); }
    catch (err) { bad(res, String(err.message || err)); }
  });
```

- [ ] **Step 2: Write failing integration tests (append to `server.test.js`)**

```js
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
```

(These avoid live playground/agent calls. `/api/loop/run` and `/refine` live behavior is covered by the Task 6 manual smoke.)

- [ ] **Step 3: Run to verify failure**

Run: `cd validator && node --test test/server.test.js`
Expected: FAIL — the two new tests fail (endpoints/behavior missing) until Step 1 is in place; if Step 1 already added, they PASS. Run the full suite next.

- [ ] **Step 4: Run the full suite**

Run: `cd validator && node --test`
Expected: PASS — all tests including the two new server tests.

- [ ] **Step 5: Commit**

```bash
git add validator/server.js validator/test/server.test.js
git commit -m "feat(validator): loop endpoints (status, sections, run, refine, finalize) + serve vendor"
```

---

### Task 6: Loop UI (view, section picker, preview grid, feedback, rounds rail)

**Files:**
- Modify: `validator/public/index.html` (loop view container + render-iframe template)
- Modify: `validator/public/app.js` (loop state + flow)
- Modify: `validator/public/styles.css` (loop layout)
- Create: `validator/public/render-frame.js` (builds the iframe srcdoc that applies a config)
- Test: `validator/test/render-frame.test.js`

**Interfaces:**
- Consumes: `/api/playground/status`, `/api/playground/sections`, `/api/loop`, `/api/loop/run`, `/api/loop/refine`, `/api/loop/finalize`; `/vendor/render-runtime.js`; existing `streamSSE`, activity modal, `state`.
- Produces: `buildRenderDoc({ html, css, config }) -> string` (in `render-frame.js`) — a full HTML doc string that injects the section html+css, imports `/vendor/render-runtime.js`, parses the config JSON, and calls `createExperience(config, { root })`.

- [ ] **Step 1: Write the failing test for `buildRenderDoc`**

```js
// validator/test/render-frame.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRenderDoc } from '../public/render-frame.js';

test('buildRenderDoc embeds section html, css, config, and imports the runtime', () => {
  const doc = buildRenderDoc({ html: '<div class="card">x</div>', css: '.card{color:red}', config: '{"schema":"interact-experience/1.0"}' });
  assert.match(doc, /<div class="card">x<\/div>/);
  assert.match(doc, /\.card\{color:red\}/);
  assert.match(doc, /\/vendor\/render-runtime\.js/);
  assert.match(doc, /createExperience/);
  assert.match(doc, /interact-experience\\?\/1\.0|interact-experience/);
});

test('buildRenderDoc escapes a closing script tag in the config to avoid breakout', () => {
  const doc = buildRenderDoc({ html: '', css: '', config: '{"x":"</script>"}' });
  assert.doesNotMatch(doc, /<\/script>\s*<\/script>/);   // the payload's </script> must be escaped
  assert.match(doc, /<\\\/script>/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd validator && node --test test/render-frame.test.js`
Expected: FAIL — `Cannot find module '../public/render-frame.js'`.

- [ ] **Step 3: Implement `validator/public/render-frame.js`**

```js
// Build a self-contained HTML document that renders a section with a generated
// @wix/interact-experience config, using the vendored renderer. The config is
// embedded as a JSON string in a data attribute (script-tag-safe).
export function buildRenderDoc({ html, css, config }) {
  const safeConfig = String(config).replace(/<\/script>/gi, '<\\/script>');
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0}${css || ''}</style></head>
<body>
<div id="__root">${html || ''}</div>
<script type="application/json" id="__config">${safeConfig}</script>
<script type="module">
  import { createExperience } from '/vendor/render-runtime.js';
  try {
    const config = JSON.parse(document.getElementById('__config').textContent);
    createExperience(config, { root: document.getElementById('__root') });
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin',
      '<pre style="color:#b00;font:12px monospace;padding:8px;white-space:pre-wrap">render error: ' + (e && e.message || e) + '</pre>');
  }
</script>
</body></html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd validator && node --test test/render-frame.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the loop view container to `index.html`**

Inside `#viewport` (after `#markdown`), add:

```html
    <div id="loopView" hidden>
      <div id="loopSections" class="loop-sections"></div>
      <div id="loopGrid" class="loop-grid"></div>
      <div id="loopFeedback" class="loop-feedback" hidden>
        <label>Score <b id="scoreVal">7</b>/10
          <input id="scoreRange" type="range" min="1" max="10" value="7" />
        </label>
        <textarea id="loopNotes" placeholder="Holistic notes — what should improve across all sections?"></textarea>
        <div class="loop-actions">
          <button id="regenBtn" class="btn">Generate again</button>
          <button id="refineBtn" class="btn btn-primary">Refine prompt</button>
        </div>
      </div>
    </div>
```

In the Prompts side of the panel, add a loop launcher button in the fix panel (after `#convertBtn`):

```html
    <button id="loopBtn" class="btn btn-block" hidden>Start refine loop</button>
    <div id="roundsRail"></div>
```

- [ ] **Step 6: Add loop styles to `styles.css`**

```css
#loopView { inset: 68px 332px 16px 322px; overflow: auto; padding: 16px; background: var(--glass-bg);
  backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); border: 1px solid var(--hair);
  border-radius: var(--radius); box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 12px; }
.loop-sections { display: flex; flex-wrap: wrap; gap: 6px; }
.loop-sections .chip { font-size: 12px; padding: 5px 10px; border-radius: 980px; background: var(--fill-1);
  color: var(--text-2); cursor: pointer; border: 1px solid transparent; }
.loop-sections .chip.on { background: var(--accent-soft); color: #fff; border-color: var(--accent); }
.loop-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.loop-cell { border: 1px solid var(--hair); border-radius: var(--radius-xs); overflow: hidden; background: #0e0e0f; }
.loop-cell .cap { font-size: 11px; color: var(--text-2); padding: 5px 8px; border-bottom: 1px solid var(--hair); }
.loop-cell iframe { width: 100%; height: 220px; border: 0; background: #fff; display: block; }
.loop-cell .err { color: #fca5a5; font-family: var(--mono); font-size: 11px; padding: 8px; }
.loop-feedback { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--hair); padding-top: 12px; }
.loop-feedback input[type=range] { width: 100%; }
#loopNotes { min-height: 60px; background: var(--fill-1); border: 1px solid var(--hair); border-radius: var(--radius-xs);
  color: var(--text); padding: 8px 10px; font-family: inherit; font-size: 12.5px; resize: vertical; }
.loop-actions { display: flex; gap: 8px; } .loop-actions .btn { flex: 1; }
#roundsRail { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.round-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 6px 8px; border-radius: var(--radius-xs);
  background: var(--fill-1); cursor: pointer; }
.round-row:hover { background: var(--fill-2); }
.round-row .sc { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--text-2); }
```

- [ ] **Step 7: Wire the loop flow in `app.js`**

Add near the top (imports):

```js
import { buildRenderDoc } from './render-frame.js';
```

Add loop state to the `state` object: `loop: { promptPath: null, sections: [], available: [], configs: {}, active: false }`.

Add these functions and event wiring (place before the final `loadFiles()` calls):

```js
async function openLoop() {
  const p = state.currentPrompt;
  if (!p) return;
  state.loop = { promptPath: p, sections: [], available: [], configs: {}, active: true };
  $('markdown').hidden = true; $('code').hidden = true; $('preview').hidden = true; $('diff').hidden = true;
  $('placeholder').hidden = true; $('loopView').hidden = false;
  const [{ up }, { sections }, loop] = await Promise.all([
    api('/api/playground/status'),
    api('/api/playground/sections'),
    api(`/api/loop?promptPath=${encodeURIComponent(p)}`),
  ]);
  state.loop.available = sections.map((s) => s.id);
  if (!up) { $('loopSections').innerHTML = '<div style="color:#fca5a5;font-size:12px">Playground not reachable at :5173 — start it (cd apps/playground && npm run dev), then reopen.</div>'; return; }
  renderSectionChips();
  renderRounds(loop.rounds);
}

function renderSectionChips() {
  $('loopSections').innerHTML = state.loop.available.map((id) =>
    `<span class="chip ${state.loop.sections.includes(id) ? 'on' : ''}" data-sec="${esc(id)}">${esc(id)}</span>`).join('')
    + '<button id="genBtn" class="btn btn-primary" style="margin-left:auto">Generate</button>';
}

function renderGrid() {
  const cells = state.loop.sections.map((id) => {
    const c = state.loop.configs[id];
    const inner = c === undefined ? '<div class="err">…generating</div>'
      : c.error ? `<div class="err">${esc(c.error)}</div>`
      : `<iframe sandbox="allow-scripts" srcdoc="${esc(buildRenderDoc({ html: c.html, css: c.css, config: c.config }))}"></iframe>`;
    return `<div class="loop-cell"><div class="cap">${esc(id)}</div>${inner}</div>`;
  }).join('');
  $('loopGrid').innerHTML = cells;
  $('loopFeedback').hidden = !state.loop.sections.length || Object.keys(state.loop.configs).length === 0;
}

async function loopGenerate() {
  const secs = state.loop.sections;
  if (!secs.length) return;
  state.loop.configs = {};
  state.logs = new Map();
  renderGrid();
  const res = await fetch('/api/loop/run', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ promptPath: state.loop.promptPath, sections: secs }) });
  await streamSSE(res, (type, d) => {
    if (type === 'result') {
      state.loop.configs[d.id] = d.error ? { error: d.error } : { config: d.config, html: d.html, css: d.css };
      renderGrid();
    } else if (type === 'log') appendLog(d.id || 'agent', d.text);
  });
  renderGrid();
}
```

(`/api/loop/run` already includes `html`/`css` in each `result` — see Task 5.)

```js
async function loopRefine() {
  const score = Number($('scoreRange').value);
  const notes = $('loopNotes').value;
  const configs = Object.entries(state.loop.configs).filter(([, c]) => c && c.config)
    .map(([id, c]) => ({ id, config: c.config, html: c.html, css: c.css }));
  state.logs = new Map();
  const res = await fetch('/api/loop/refine', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ promptPath: state.loop.promptPath, score, notes, configs }) });
  await streamSSE(res, (type, d) => {
    if (type === 'log') appendLog('refine', d.text);
    else if (type === 'done') { $('loopNotes').value = ''; loopRefreshRounds(); }
  });
}

async function loopRefreshRounds() {
  const loop = await api(`/api/loop?promptPath=${encodeURIComponent(state.loop.promptPath)}`);
  renderRounds(loop.rounds);
}

function renderRounds(rounds) {
  state.loop.rounds = rounds || [];
  $('roundsRail').innerHTML = state.loop.rounds.map((r) =>
    `<div class="round-row" data-round="${r.round}" title="${esc(r.notes || '')}">Round ${r.round}
      <span class="sc">${r.score}/10</span>
      <button class="btn rollback-btn" data-round="${r.round}" style="padding:2px 8px">rollback</button></div>`).join('')
    + (state.loop.rounds.length ? '<button id="finalizeBtn" class="btn btn-block" style="margin-top:6px">Close loop (write to .md)</button>' : '');
}

// Load a past round's stored outputs + feedback back into the view (read-only look).
function viewRound(round) {
  const r = (state.loop.rounds || []).find((x) => x.round === round);
  if (!r) return;
  state.loop.configs = {};
  for (const s of r.sections) state.loop.configs[s.id] = { config: s.config, html: s.html, css: s.css };
  $('scoreRange').value = r.score; $('scoreVal').textContent = r.score; $('loopNotes').value = r.notes || '';
  renderGrid();
}

// event delegation
$('loopSections').addEventListener('click', (e) => {
  if (e.target.id === 'genBtn') return loopGenerate();
  const chip = e.target.closest('.chip'); if (!chip) return;
  const id = chip.dataset.sec;
  const i = state.loop.sections.indexOf(id);
  if (i >= 0) state.loop.sections.splice(i, 1);
  else if (state.loop.sections.length < 4) state.loop.sections.push(id);
  renderSectionChips();
});
$('scoreRange').addEventListener('input', (e) => { $('scoreVal').textContent = e.target.value; });
$('regenBtn').onclick = loopGenerate;
$('refineBtn').onclick = async () => { await loopRefine(); await loopGenerate(); };
$('roundsRail').addEventListener('click', async (e) => {
  if (e.target.id === 'finalizeBtn') {
    await api('/api/loop/finalize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ promptPath: state.loop.promptPath }) });
    $('applyStatus').textContent = 'Loop closed — final guideline written to the .md.';
    return;
  }
  const rb = e.target.closest('.rollback-btn');
  if (rb) {
    await api('/api/loop/rollback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ promptPath: state.loop.promptPath, round: Number(rb.dataset.round) }) });
    $('applyStatus').textContent = `Rolled back to round ${rb.dataset.round}'s guideline (working version).`;
    return;
  }
  const row = e.target.closest('.round-row');
  if (row) viewRound(Number(row.dataset.round));
});
$('loopBtn').onclick = openLoop;
```

Also: in the prompt-selection path (`render()` / prompt row click), show `#loopBtn` when `state.view === 'prompts'` and a prompt is selected: set `$('loopBtn').hidden = !(state.view === 'prompts' && state.currentPrompt)`. And when switching away from a prompt/loop, set `$('loopView').hidden = true`.

- [ ] **Step 8: Full suite green**

Run: `cd validator && node --test`
Expected: PASS — all tests (including render-frame + the adjusted server run payload).

- [ ] **Step 9: Manual smoke (needs the playground running)**

1. In a separate terminal: `cd ~/Documents/Dev/Wix/interact-xp/apps/playground && npm run dev` (user action; confirms :5173).
2. `cd validator && npm start`; open `http://localhost:4500`; Prompts tab; pick a prompt that exists (generate one via Convert first if needed).
3. Click **Start refine loop** → pick 2–3 sections → **Generate**.
   Expected: each cell renders the section with the animation applied (or a clear per-cell error); the Agent-activity modal streams reasoning.
4. Set a score + notes → **Refine prompt** → then **Generate again**.
   Expected: a new round appears in the rail with the score; outputs reflect the refined guideline.
5. **Close loop** → confirm the prompt's `.md` now equals the working guideline (`Prompts` tab → Raw), and `Ani-Mate Prompts/<path>.md.history.json` exists.

- [ ] **Step 10: Commit**

```bash
git add validator/public/index.html validator/public/app.js validator/public/styles.css validator/public/render-frame.js validator/test/render-frame.test.js validator/server.js
git commit -m "feat(validator): prompt refinement loop UI (sections, previews, score, refine, rounds)"
```

---

## Self-Review Notes

- **Spec coverage:** integration via `/api/generate` (Task 2) ✔; bundled renderer + serve (Tasks 1, 5) ✔; 2–4 sections per round with side-by-side render (Task 6) ✔; holistic score 1–10 + notes (Task 6) ✔; general no-overfit refine (Task 4) ✔; full round history + rollback + finalize-to-.md (Task 3) ✔; playground-down + per-section-failure handling (Tasks 5, 6) ✔; read-only interact-xp (all tasks; only reads/imports/esbuild-into-validator/HTTP) ✔; SSE mirrors /api/fix (Tasks 5, 6) ✔.
- **Deferred per spec:** repair loop, auto-launch playground, browser automation — not implemented.
- **Render payload:** `/api/loop/run` includes `html`/`css` in each `result` (Task 5) so the iframe can render; `loopRefine` stores `{id,config,html,css}` in history so a past round can be re-viewed (Task 6).
- **Rollback:** included — `rollback` in loop-store (Task 3), `/api/loop/rollback` endpoint (Task 5), and per-round rollback button + click-to-view in the rounds rail (Task 6).
- **Type consistency:** round shape `{round,guideline,sections:[{id,config,html,css}],score,notes}` is identical across loop-store.js, server.js, and app.js; `generate()` returns `{config,sessionId}` consumed by `/api/loop/run`; `buildRenderDoc({html,css,config})` matches its call site; `refineGuideline` returns markdown consumed by `recordRound(newWorking)`.
