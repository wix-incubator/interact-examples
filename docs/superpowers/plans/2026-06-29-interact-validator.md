# Interact Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web tool that scans every `@wix/interact` animation HTML file, categorizes it by static analysis, and uses the Claude Agent SDK to rewrite selected files to the latest interact syntax — with draft diffs the user previews before applying.

**Architecture:** A Node (Express, ESM) backend serves a vanilla-JS UI and a REST API. Pure-function library modules (`detect`, `files`, `prompt`, `drafts`) do deterministic work; an `agent` module wraps the Claude Agent SDK for one-shot HTML rewrites; a `fix` orchestrator ties detect→prompt→agent→draft together with bounded concurrency. Fixes are written to sidecar `.drafts/` files, diffed/previewed, then applied over originals (git is the undo).

**Tech Stack:** Node 18+ (ESM), Express, the `diff` npm package, `@anthropic-ai/claude-agent-sdk`. Tests use Node's built-in `node:test` + `node:assert/strict` (zero extra deps). UI is vanilla HTML/JS/CSS.

## Global Constraints

- All new code lives under `validator/`. Do **NOT** modify `explorer.html`, the `analysis/` directory, or any animation HTML file by hand.
- **Latest interact version = `2.4.0`** (the `LATEST_VERSION` constant). Canonical CDN import: `https://esm.sh/@wix/interact@2.4.0` (+ `https://esm.sh/@wix/motion-presets`).
- Correct custom-element tag is `<interact-element data-interact-key="...">`. `wix-interact-element` is an outdated marker.
- Agent SDK package is exactly `@anthropic-ai/claude-agent-sdk`; it uses the local Claude Code login by default (no `ANTHROPIC_API_KEY` required). `query({ prompt, options })` returns an `AsyncGenerator<SDKMessage>`; the final text is on the message where `msg.type === 'result' && msg.subtype === 'success'` as `msg.result`.
- Backend must reject any request `path` that resolves outside the repo root (no path traversal).
- "Remove extra JavaScript" fix option defaults **OFF**.
- ESM everywhere (`"type": "module"` in package.json). Run tests with `node --test`.

---

### Task 1: Project scaffold + constants + file enumeration

**Files:**
- Create: `validator/package.json`
- Create: `validator/lib/constants.js`
- Create: `validator/lib/files.js`
- Test: `validator/test/files.test.js`

**Interfaces:**
- Produces: `LATEST_VERSION`, `INTERACT_CDN`, `PRESETS_CDN`, `IGNORED_DIRS`, `DRAFTS_DIR` (from `constants.js`); `listAnimationFiles(rootDir) -> Array<{ path: string, dir: string, file: string }>` where `path` is a POSIX-relative path from `rootDir` (from `files.js`).

- [ ] **Step 1: Create `validator/package.json`**

```json
{
  "name": "interact-validator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "diff": "^7.0.0",
    "express": "^4.21.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd validator && npm install`
Expected: `node_modules/` created, no errors. (If `@anthropic-ai/claude-agent-sdk` version `^0.1.0` is unavailable, run `npm install @anthropic-ai/claude-agent-sdk@latest` and keep the resolved version.)

- [ ] **Step 3: Create `validator/lib/constants.js`**

```js
export const LATEST_VERSION = '2.4.0';
export const INTERACT_CDN = `https://esm.sh/@wix/interact@${LATEST_VERSION}`;
export const PRESETS_CDN = 'https://esm.sh/@wix/motion-presets';
export const DRAFTS_DIR = '.drafts';

// Directories never scanned for animation files.
export const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.drafts', '.backups',
  'analysis', 'explorer-screenshots', 'docs', 'validator', '.cursor',
]);

// Files at any level that are not animations.
export const IGNORED_FILES = new Set(['explorer.html']);
```

- [ ] **Step 4: Write the failing test for `listAnimationFiles`**

```js
// validator/test/files.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listAnimationFiles } from '../lib/files.js';

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'iv-files-'));
  await mkdir(join(root, 'Gallery-and-Carousel'), { recursive: true });
  await mkdir(join(root, 'analysis'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'x'), { recursive: true });
  await writeFile(join(root, 'explorer.html'), '<html></html>');
  await writeFile(join(root, 'Gallery-and-Carousel', 'A.html'), '<html></html>');
  await writeFile(join(root, 'Gallery-and-Carousel', 'notes.txt'), 'x');
  await writeFile(join(root, 'analysis', 'B.html'), '<html></html>');
  await writeFile(join(root, 'node_modules', 'x', 'C.html'), '<html></html>');
  return root;
}

test('lists html animations and ignores excluded dirs/files', async () => {
  const root = await makeRepo();
  const files = await listAnimationFiles(root);
  const paths = files.map((f) => f.path).sort();
  assert.deepEqual(paths, ['Gallery-and-Carousel/A.html']);
  assert.equal(files[0].dir, 'Gallery-and-Carousel');
  assert.equal(files[0].file, 'A.html');
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd validator && node --test test/files.test.js`
Expected: FAIL — `Cannot find module '../lib/files.js'`.

- [ ] **Step 6: Implement `validator/lib/files.js`**

```js
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { IGNORED_DIRS, IGNORED_FILES } from './constants.js';

export async function listAnimationFiles(rootDir) {
  const out = [];
  async function walk(absDir) {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(abs);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        if (IGNORED_FILES.has(entry.name)) continue;
        const rel = relative(rootDir, abs).split(sep).join('/');
        const slash = rel.lastIndexOf('/');
        out.push({
          path: rel,
          dir: slash === -1 ? '' : rel.slice(0, slash),
          file: slash === -1 ? rel : rel.slice(slash + 1),
        });
      }
    }
  }
  await walk(rootDir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd validator && node --test test/files.test.js`
Expected: PASS (1 test).

- [ ] **Step 8: Commit**

```bash
git add validator/package.json validator/package-lock.json validator/lib/constants.js validator/lib/files.js validator/test/files.test.js
git commit -m "feat(validator): scaffold + animation file enumeration"
```

---

### Task 2: Static detection engine

**Files:**
- Create: `validator/lib/detect.js`
- Test: `validator/test/detect.test.js`

**Interfaces:**
- Consumes: `LATEST_VERSION` from `constants.js`.
- Produces: `detect(filePath, source) -> Diagnosis`, where
  `Diagnosis = { path, usesInteract, version, isLatest, usesCustomEffect, usesExtraJs, extraJsSignals: string[], oldSyntaxMarkers: string[], category }`
  and `category ∈ { 'Not using interact', 'Outdated version', 'Uses extra JS', 'Uses customEffect', 'Clean & current' }`.

- [ ] **Step 1: Write the failing tests**

```js
// validator/test/detect.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../lib/detect.js';

const clean = `
<script type="module">
  import { Interact } from 'https://esm.sh/@wix/interact@2.4.0';
  Interact.create({ interactions: [{ key:'a', trigger:'hover',
    effects:[{ namedEffect:{ type:'FadeIn' }, duration:300, triggerType:'once' }] }] });
</script>
<interact-element data-interact-key="a"><div>x</div></interact-element>`;

test('clean current file', () => {
  const d = detect('X.html', clean);
  assert.equal(d.usesInteract, true);
  assert.equal(d.version, '2.4.0');
  assert.equal(d.isLatest, true);
  assert.equal(d.usesCustomEffect, false);
  assert.equal(d.usesExtraJs, false);
  assert.deepEqual(d.oldSyntaxMarkers, []);
  assert.equal(d.category, 'Clean & current');
});

test('outdated version', () => {
  const d = detect('Y.html', `import { Interact } from 'https://esm.sh/@wix/interact@1.79.0';`);
  assert.equal(d.usesInteract, true);
  assert.equal(d.version, '1.79.0');
  assert.equal(d.isLatest, false);
  assert.equal(d.category, 'Outdated version');
});

test('not using interact', () => {
  const d = detect('Z.html', `<script>console.log('hi')</script>`);
  assert.equal(d.usesInteract, false);
  assert.equal(d.version, null);
  assert.equal(d.category, 'Not using interact');
});

test('old syntax markers flag a latest-version file as outdated', () => {
  const src = `import {Interact} from 'https://esm.sh/@wix/interact@2.4.0';
    Interact.create({ interactions:[{ key:'a', trigger:'hover',
      params:{ method:'toggle' }, effects:[{ customEffect:()=>{} }] }] });
    <wix-interact-element data-interact-key="a"></wix-interact-element>`;
  const d = detect('W.html', src);
  assert.ok(d.oldSyntaxMarkers.some((m) => m.includes('wix-interact-element')));
  assert.ok(d.oldSyntaxMarkers.some((m) => m.includes('method')));
  assert.equal(d.category, 'Outdated version');
});

test('extra js detection', () => {
  const src = `import {Interact} from 'https://esm.sh/@wix/interact@2.4.0';
    window.addEventListener('scroll', () => {});
    new IntersectionObserver(() => {});
    el.animate([], 300);`;
  const d = detect('V.html', src);
  assert.equal(d.usesExtraJs, true);
  assert.ok(d.extraJsSignals.includes('addEventListener(scroll)'));
  assert.ok(d.extraJsSignals.includes('IntersectionObserver'));
  assert.ok(d.extraJsSignals.includes('Element.animate()'));
  assert.equal(d.category, 'Uses extra JS');
});

test('customEffect on a latest, no-extra-js file', () => {
  const src = `import {Interact} from 'https://esm.sh/@wix/interact@2.4.0';
    Interact.create({ interactions:[{ key:'a', trigger:'pointerMove',
      effects:[{ customEffect:(el,p)=>{} }] }] });`;
  const d = detect('U.html', src);
  assert.equal(d.usesCustomEffect, true);
  assert.equal(d.usesExtraJs, false);
  assert.equal(d.category, 'Uses customEffect');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd validator && node --test test/detect.test.js`
Expected: FAIL — `Cannot find module '../lib/detect.js'`.

- [ ] **Step 3: Implement `validator/lib/detect.js`**

```js
import { LATEST_VERSION } from './constants.js';

const EXTRA_JS_PATTERNS = [
  { re: /addEventListener\(\s*['"`](scroll|wheel|mousemove|pointermove|pointerdown|touchmove)['"`]/g,
    label: (m) => `addEventListener(${m[1]})` },
  { re: /\bIntersectionObserver\b/, label: () => 'IntersectionObserver' },
  { re: /\.animate\s*\(/, label: () => 'Element.animate()' },
  { re: /\brequestAnimationFrame\b/, label: () => 'requestAnimationFrame loop' },
  { re: /\bsetInterval\b/, label: () => 'setInterval loop' },
];

function findExtraJs(source) {
  const signals = [];
  for (const { re, label } of EXTRA_JS_PATTERNS) {
    if (re.global) {
      let m;
      const r = new RegExp(re.source, re.flags);
      while ((m = r.exec(source)) !== null) {
        const s = label(m);
        if (!signals.includes(s)) signals.push(s);
      }
    } else if (re.test(source)) {
      signals.push(label());
    }
  }
  return signals;
}

function findOldSyntaxMarkers(source) {
  const markers = [];
  if (/wix-interact-element/.test(source)) markers.push('wix-interact-element tag (use interact-element)');
  if (/\bmethod\s*:/.test(source)) markers.push('params.method (use stateAction on the effect)');
  if (/\btype\s*:\s*['"`](once|repeat|alternate|state)['"`]/.test(source)) markers.push('params.type play-mode (use triggerType on the effect)');
  if (/\btype\s*:\s*['"`](percentage|px|vh|vw|vmin|vmax|em|rem)['"`]/.test(source)) markers.push('range offset {value,type} (use unit)');
  if (/useCutsomElement/.test(source)) markers.push('useCutsomElement typo (use useCustomElement)');
  return markers;
}

export function detect(filePath, source) {
  const usesInteract = /@wix\/interact/.test(source);
  const versionMatch = source.match(/@wix\/interact@(\d+\.\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : null;
  const isLatest = version === LATEST_VERSION;
  const usesCustomEffect = /customEffect\s*:/.test(source);
  const extraJsSignals = findExtraJs(source);
  const usesExtraJs = extraJsSignals.length > 0;
  const oldSyntaxMarkers = findOldSyntaxMarkers(source);

  let category;
  if (!usesInteract) category = 'Not using interact';
  else if (!isLatest || oldSyntaxMarkers.length > 0) category = 'Outdated version';
  else if (usesExtraJs) category = 'Uses extra JS';
  else if (usesCustomEffect) category = 'Uses customEffect';
  else category = 'Clean & current';

  return { path: filePath, usesInteract, version, isLatest, usesCustomEffect,
    usesExtraJs, extraJsSignals, oldSyntaxMarkers, category };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd validator && node --test test/detect.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add validator/lib/detect.js validator/test/detect.test.js
git commit -m "feat(validator): static detection engine"
```

---

### Task 3: Draft store (path safety, write/read, diff, apply, discard)

**Files:**
- Create: `validator/lib/drafts.js`
- Test: `validator/test/drafts.test.js`

**Interfaces:**
- Consumes: `DRAFTS_DIR` from `constants.js`; `diffLines` from the `diff` package.
- Produces:
  - `resolveSafe(rootDir, relPath) -> string` (absolute path; throws `Error('path escapes root')` if outside root)
  - `draftAbsPath(rootDir, relPath) -> string`
  - `writeDraft(rootDir, relPath, content) -> Promise<void>`
  - `readDraft(rootDir, relPath) -> Promise<string|null>`
  - `readOriginal(rootDir, relPath) -> Promise<string>`
  - `computeDiff(original, draft) -> Array<{ value: string, added?: boolean, removed?: boolean }>`
  - `applyDraft(rootDir, relPath) -> Promise<void>` (throws `Error('no draft')` if draft missing)
  - `discardDraft(rootDir, relPath) -> Promise<void>`

- [ ] **Step 1: Write the failing tests**

```js
// validator/test/drafts.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSafe, writeDraft, readDraft, readOriginal,
  computeDiff, applyDraft, discardDraft } from '../lib/drafts.js';

async function repo() {
  const root = await mkdtemp(join(tmpdir(), 'iv-drafts-'));
  await mkdir(join(root, 'Gallery-and-Carousel'), { recursive: true });
  await writeFile(join(root, 'Gallery-and-Carousel', 'A.html'), 'ORIGINAL\n');
  return root;
}

test('resolveSafe rejects traversal', async () => {
  const root = await repo();
  assert.throws(() => resolveSafe(root, '../escape.html'), /escapes root/);
  assert.doesNotThrow(() => resolveSafe(root, 'Gallery-and-Carousel/A.html'));
});

test('write/read draft round trip', async () => {
  const root = await repo();
  await writeDraft(root, 'Gallery-and-Carousel/A.html', 'FIXED\n');
  assert.equal(await readDraft(root, 'Gallery-and-Carousel/A.html'), 'FIXED\n');
  assert.equal(await readDraft(root, 'Gallery-and-Carousel/missing.html'), null);
});

test('computeDiff marks added and removed lines', async () => {
  const parts = computeDiff('ORIGINAL\n', 'FIXED\n');
  assert.ok(parts.some((p) => p.removed && p.value.includes('ORIGINAL')));
  assert.ok(parts.some((p) => p.added && p.value.includes('FIXED')));
});

test('applyDraft overwrites original and clears draft', async () => {
  const root = await repo();
  await writeDraft(root, 'Gallery-and-Carousel/A.html', 'FIXED\n');
  await applyDraft(root, 'Gallery-and-Carousel/A.html');
  assert.equal(await readOriginal(root, 'Gallery-and-Carousel/A.html'), 'FIXED\n');
  assert.equal(await readDraft(root, 'Gallery-and-Carousel/A.html'), null);
});

test('applyDraft throws when no draft', async () => {
  const root = await repo();
  await assert.rejects(() => applyDraft(root, 'Gallery-and-Carousel/A.html'), /no draft/);
});

test('discardDraft removes draft only', async () => {
  const root = await repo();
  await writeDraft(root, 'Gallery-and-Carousel/A.html', 'FIXED\n');
  await discardDraft(root, 'Gallery-and-Carousel/A.html');
  assert.equal(await readDraft(root, 'Gallery-and-Carousel/A.html'), null);
  assert.equal(await readOriginal(root, 'Gallery-and-Carousel/A.html'), 'ORIGINAL\n');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd validator && node --test test/drafts.test.js`
Expected: FAIL — `Cannot find module '../lib/drafts.js'`.

- [ ] **Step 3: Implement `validator/lib/drafts.js`**

```js
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, sep, dirname } from 'node:path';
import { diffLines } from 'diff';
import { DRAFTS_DIR } from './constants.js';

export function resolveSafe(rootDir, relPath) {
  const root = resolve(rootDir);
  const abs = resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error('path escapes root');
  }
  return abs;
}

export function draftAbsPath(rootDir, relPath) {
  // Validate relPath is in-root, then place it under DRAFTS_DIR.
  resolveSafe(rootDir, relPath);
  return resolve(rootDir, DRAFTS_DIR, relPath);
}

export async function writeDraft(rootDir, relPath, content) {
  const abs = draftAbsPath(rootDir, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

export async function readDraft(rootDir, relPath) {
  try {
    return await readFile(draftAbsPath(rootDir, relPath), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function readOriginal(rootDir, relPath) {
  return readFile(resolveSafe(rootDir, relPath), 'utf8');
}

export function computeDiff(original, draft) {
  return diffLines(original, draft);
}

export async function applyDraft(rootDir, relPath) {
  const draft = await readDraft(rootDir, relPath);
  if (draft === null) throw new Error('no draft');
  await writeFile(resolveSafe(rootDir, relPath), draft, 'utf8');
  await discardDraft(rootDir, relPath);
}

export async function discardDraft(rootDir, relPath) {
  await rm(draftAbsPath(rootDir, relPath), { force: true });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd validator && node --test test/drafts.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add validator/lib/drafts.js validator/test/drafts.test.js
git commit -m "feat(validator): draft store with diff/apply/discard and path safety"
```

---

### Task 4: Prompt assembly

**Files:**
- Create: `validator/lib/prompt.js`
- Test: `validator/test/prompt.test.js`

**Interfaces:**
- Consumes: `INTERACT_CDN`, `PRESETS_CDN`, `LATEST_VERSION` from `constants.js`; a `Diagnosis` from `detect.js`.
- Produces:
  - `FIX_OPTIONS: Array<{ id, label, default: boolean, fragment: string }>` with ids `updateVersion`, `migrateSyntax`, `convertCustomEffect`, `removeExtraJs`, `convertToInteract`.
  - `buildPrompt({ diagnosis, source, optionIds: string[], customPrompt: string, specText: string }) -> { system: string, user: string }`.

- [ ] **Step 1: Write the failing tests**

```js
// validator/test/prompt.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIX_OPTIONS, buildPrompt } from '../lib/prompt.js';

test('FIX_OPTIONS has expected ids and removeExtraJs defaults off', () => {
  const ids = FIX_OPTIONS.map((o) => o.id);
  assert.deepEqual(ids, ['updateVersion', 'migrateSyntax', 'convertCustomEffect', 'removeExtraJs', 'convertToInteract']);
  assert.equal(FIX_OPTIONS.find((o) => o.id === 'removeExtraJs').default, false);
  assert.equal(FIX_OPTIONS.find((o) => o.id === 'updateVersion').default, true);
});

test('buildPrompt embeds selected fragments, custom prompt, spec, and source', () => {
  const diagnosis = { path: 'A.html', version: '1.79.0', category: 'Outdated version', oldSyntaxMarkers: ['x'] };
  const { system, user } = buildPrompt({
    diagnosis, source: '<html>SRC</html>',
    optionIds: ['updateVersion', 'migrateSyntax'],
    customPrompt: 'keep the colors', specText: 'SPEC-RULES',
  });
  assert.match(system, /SPEC-RULES/);
  assert.match(system, /ONLY the complete rewritten HTML/i);
  assert.match(user, /2\.4\.0/);            // updateVersion fragment mentions target version
  assert.match(user, /triggerType|stateAction/); // migrateSyntax fragment mentions renames
  assert.match(user, /keep the colors/);
  assert.match(user, /SRC/);
  assert.match(user, /Outdated version/);   // diagnosis included
});

test('buildPrompt ignores unknown option ids and tolerates empty custom prompt', () => {
  const { user } = buildPrompt({
    diagnosis: { path: 'A.html', category: 'Clean & current', oldSyntaxMarkers: [] },
    source: 'x', optionIds: ['bogus'], customPrompt: '', specText: 's',
  });
  assert.doesNotMatch(user, /undefined/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd validator && node --test test/prompt.test.js`
Expected: FAIL — `Cannot find module '../lib/prompt.js'`.

- [ ] **Step 3: Implement `validator/lib/prompt.js`**

```js
import { INTERACT_CDN, PRESETS_CDN, LATEST_VERSION } from './constants.js';

export const FIX_OPTIONS = [
  { id: 'updateVersion', label: 'Update to latest version', default: true,
    fragment: `Update all @wix/interact imports to version ${LATEST_VERSION} using "${INTERACT_CDN}" (and "${PRESETS_CDN}" for named presets). Migrate any version-specific syntax that the new version requires.` },
  { id: 'migrateSyntax', label: 'Migrate old syntax', default: true,
    fragment: `Migrate outdated syntax to the current API: move play-mode off Interaction.params onto the effect and rename params.type -> triggerType (on TimeEffect) and params.method -> stateAction (on StateEffect); rename range-offset {value,type} -> {value,unit}; rename the custom element tag wix-interact-element -> interact-element; fix the useCutsomElement -> useCustomElement typo.` },
  { id: 'convertCustomEffect', label: 'Convert customEffect → preset/keyframe', default: false,
    fragment: `Where a customEffect merely maps to a known namedEffect (from @wix/motion-presets) or a keyframeEffect, replace it with that idiomatic effect. Only keep customEffect when the behavior genuinely requires per-frame DOM manipulation or randomness.` },
  { id: 'removeExtraJs', label: 'Remove extra JavaScript', default: false,
    fragment: `Remove hand-written JavaScript (manual addEventListener, IntersectionObserver, direct Element.animate, requestAnimationFrame/setInterval animation loops) and express the same behavior through @wix/interact triggers and effects instead.` },
  { id: 'convertToInteract', label: 'Convert non-interact → interact', default: false,
    fragment: `This file does not currently use @wix/interact. Rewrite it so the animation is driven by @wix/interact (import it, wrap targets in <interact-element data-interact-key>, and call Interact.create once), preserving the original visual result.` },
];

const SYSTEM = (specText) => `You are an expert at the @wix/interact animation library. You rewrite standalone HTML animation files so they use @wix/interact correctly on the latest version.

Follow this canonical reference exactly:
${specText}

OUTPUT CONTRACT: Return ONLY the complete rewritten HTML file. No markdown code fences, no commentary, no explanation — just the raw HTML from <!DOCTYPE html> (or the file's first line) to its end. Preserve the original visual design, layout, copy, and asset URLs unless a requested fix requires changing them.`;

export function buildPrompt({ diagnosis, source, optionIds, customPrompt, specText }) {
  const chosen = FIX_OPTIONS.filter((o) => optionIds.includes(o.id));
  const fixList = chosen.length
    ? chosen.map((o) => `- ${o.label}: ${o.fragment}`).join('\n')
    : '- Apply only the custom instructions below.';
  const custom = customPrompt && customPrompt.trim()
    ? `\nCustom instructions (highest priority):\n${customPrompt.trim()}\n`
    : '';
  const user = `File: ${diagnosis.path}
Static diagnosis: ${JSON.stringify(diagnosis)}

Requested fixes:
${fixList}
${custom}
--- ORIGINAL SOURCE ---
${source}`;
  return { system: SYSTEM(specText), user };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd validator && node --test test/prompt.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add validator/lib/prompt.js validator/test/prompt.test.js
git commit -m "feat(validator): fix-option prompt assembly"
```

---

### Task 5: Agent wrapper (Claude Agent SDK)

**Files:**
- Create: `validator/lib/agent.js`
- Test: `validator/test/agent.test.js`

**Interfaces:**
- Consumes: `query` from `@anthropic-ai/claude-agent-sdk`.
- Produces:
  - `extractHtml(text) -> string` (strips ```html / ``` fences and surrounding whitespace).
  - `runAgent(system, user, { model } = {}) -> Promise<string>` (one-shot; returns final result text). Uses `maxTurns: 1`, `allowedTools: []` so no tools/loop.

- [ ] **Step 1: Write the failing test for `extractHtml` (pure, no SDK)**

```js
// validator/test/agent.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHtml } from '../lib/agent.js';

test('extractHtml strips html code fences', () => {
  assert.equal(extractHtml('```html\n<div>x</div>\n```'), '<div>x</div>');
});
test('extractHtml strips bare fences', () => {
  assert.equal(extractHtml('```\n<div>x</div>\n```'), '<div>x</div>');
});
test('extractHtml passes through plain html', () => {
  assert.equal(extractHtml('<!DOCTYPE html>\n<html></html>'), '<!DOCTYPE html>\n<html></html>');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd validator && node --test test/agent.test.js`
Expected: FAIL — `Cannot find module '../lib/agent.js'`.

- [ ] **Step 3: Implement `validator/lib/agent.js`**

```js
import { query } from '@anthropic-ai/claude-agent-sdk';

export function extractHtml(text) {
  let t = String(text).trim();
  const fence = t.match(/^```(?:html)?\s*\n([\s\S]*?)\n```$/i);
  if (fence) t = fence[1];
  return t.trim();
}

export async function runAgent(system, user, { model } = {}) {
  const options = {
    systemPrompt: system,
    allowedTools: [],
    maxTurns: 1,
    permissionMode: 'default',
  };
  if (model) options.model = model;

  let resultText = '';
  let assistantText = '';
  for await (const msg of query({ prompt: user, options })) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') assistantText += block.text;
      }
    } else if (msg.type === 'result') {
      if (msg.subtype === 'success') resultText = msg.result;
      else throw new Error(`agent error: ${msg.subtype}`);
    }
  }
  return resultText || assistantText;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd validator && node --test test/agent.test.js`
Expected: PASS (3 tests). (`runAgent` is exercised live in Task 8's manual smoke test, not unit-tested, since it depends on Claude.)

- [ ] **Step 5: Commit**

```bash
git add validator/lib/agent.js validator/test/agent.test.js
git commit -m "feat(validator): Claude Agent SDK wrapper + html extraction"
```

---

### Task 6: Fix orchestrator (bounded concurrency + self-check)

**Files:**
- Create: `validator/lib/fix.js`
- Test: `validator/test/fix.test.js`

**Interfaces:**
- Consumes: `detect` (detect.js), `buildPrompt` (prompt.js), `writeDraft` (drafts.js), `extractHtml` (agent.js).
- Produces:
  - `mapLimit(items, limit, fn) -> Promise<Array>` (preserves input order).
  - `fixFile(rootDir, relPath, { source, optionIds, customPrompt, specText, runAgent, model }) -> Promise<Result>` where `Result = { path, status: 'fixed'|'needsReview'|'fixFailed', error?: string, recheck?: Diagnosis }`. `runAgent` is injected (defaults to the real one) so tests can mock it.
  - `runFix(rootDir, files: Array<{path, source}>, { optionIds, customPrompt, specText, runAgent, model, concurrency }) -> Promise<Result[]>`.

- [ ] **Step 1: Write the failing tests (mocked agent — no live calls)**

```js
// validator/test/fix.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mapLimit, fixFile, runFix } from '../lib/fix.js';
import { readDraft } from '../lib/drafts.js';

const root = () => mkdtemp(join(tmpdir(), 'iv-fix-'));
const SPEC = 'spec';

test('mapLimit preserves order and caps concurrency', async () => {
  let active = 0, max = 0;
  const fn = async (n) => {
    active++; max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 5));
    active--; return n * 2;
  };
  const out = await mapLimit([1, 2, 3, 4, 5], 2, fn);
  assert.deepEqual(out, [2, 4, 6, 8, 10]);
  assert.ok(max <= 2);
});

test('fixFile writes a draft and reports fixed when recheck is clean', async () => {
  const r = await root();
  const good = `import {Interact} from 'https://esm.sh/@wix/interact@2.4.0';
    Interact.create({ interactions:[{ key:'a', trigger:'hover',
      effects:[{ namedEffect:{type:'FadeIn'}, duration:300, triggerType:'once' }] }] });`;
  const res = await fixFile(r, 'A.html', {
    source: 'OLD', optionIds: ['updateVersion'], customPrompt: '', specText: SPEC,
    runAgent: async () => good,
  });
  assert.equal(res.status, 'fixed');
  assert.equal(await readDraft(r, 'A.html'), good);
});

test('fixFile reports needsReview when draft still diagnoses as problematic', async () => {
  const r = await root();
  const res = await fixFile(r, 'B.html', {
    source: 'OLD', optionIds: ['updateVersion'], customPrompt: '', specText: SPEC,
    runAgent: async () => `import {Interact} from 'https://esm.sh/@wix/interact@1.79.0';`,
  });
  assert.equal(res.status, 'needsReview');
});

test('fixFile reports fixFailed and writes no draft when agent throws', async () => {
  const r = await root();
  const res = await fixFile(r, 'C.html', {
    source: 'OLD', optionIds: ['updateVersion'], customPrompt: '', specText: SPEC,
    runAgent: async () => { throw new Error('boom'); },
  });
  assert.equal(res.status, 'fixFailed');
  assert.match(res.error, /boom/);
  assert.equal(await readDraft(r, 'C.html'), null);
});

test('runFix processes a batch', async () => {
  const r = await root();
  const results = await runFix(r,
    [{ path: 'A.html', source: 'x' }, { path: 'B.html', source: 'y' }],
    { optionIds: ['updateVersion'], customPrompt: '', specText: SPEC,
      runAgent: async () => 'import "https://esm.sh/@wix/interact@2.4.0";', concurrency: 2 });
  assert.equal(results.length, 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd validator && node --test test/fix.test.js`
Expected: FAIL — `Cannot find module '../lib/fix.js'`.

- [ ] **Step 3: Implement `validator/lib/fix.js`**

```js
import { detect } from './detect.js';
import { buildPrompt } from './prompt.js';
import { writeDraft } from './drafts.js';
import { extractHtml, runAgent as realRunAgent } from './agent.js';

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function fixFile(rootDir, relPath, opts) {
  const { source, optionIds, customPrompt, specText, model, runAgent = realRunAgent } = opts;
  try {
    const diagnosis = detect(relPath, source);
    const { system, user } = buildPrompt({ diagnosis, source, optionIds, customPrompt, specText });
    const html = extractHtml(await runAgent(system, user, { model }));
    await writeDraft(rootDir, relPath, html);
    const recheck = detect(relPath, html);
    const clean = recheck.category === 'Clean & current'
      || (recheck.isLatest && recheck.oldSyntaxMarkers.length === 0);
    return { path: relPath, status: clean ? 'fixed' : 'needsReview', recheck };
  } catch (err) {
    return { path: relPath, status: 'fixFailed', error: String(err.message || err) };
  }
}

export async function runFix(rootDir, files, opts) {
  const { concurrency = 4, ...rest } = opts;
  return mapLimit(files, concurrency, (f) =>
    fixFile(rootDir, f.path, { ...rest, source: f.source }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd validator && node --test test/fix.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add validator/lib/fix.js validator/test/fix.test.js
git commit -m "feat(validator): fix orchestrator with bounded concurrency + self-check"
```

---

### Task 7: Express server + REST API

**Files:**
- Create: `validator/server.js`
- Create: `validator/lib/spec.js`
- Test: `validator/test/server.test.js`

**Interfaces:**
- Consumes: every lib module above.
- Produces: `createApp(rootDir) -> express.Application` (exported from `server.js` for tests); the file also self-starts a listener when run directly. `loadSpecText(rootDir) -> Promise<string>` from `spec.js` (reads `full-lean.md`).
- Endpoints: `GET /api/files`, `GET /api/file?path=`, `POST /api/scan` `{paths?}`, `POST /api/fix` `{paths, optionIds, customPrompt}`, `GET /api/diff?path=`, `GET /api/draft?path=`, `POST /api/apply` `{paths}`, `POST /api/discard` `{paths}`. Static UI served from `validator/public`.

- [ ] **Step 1: Implement `validator/lib/spec.js`**

```js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadSpecText(rootDir) {
  try {
    return await readFile(join(rootDir, 'full-lean.md'), 'utf8');
  } catch {
    return 'Use @wix/interact 2.4.0. Tag: <interact-element data-interact-key>. '
      + 'Effects: namedEffect | keyframeEffect | customEffect. '
      + 'Play-mode: triggerType (TimeEffect) / stateAction (StateEffect).';
  }
}
```

- [ ] **Step 2: Write the failing integration tests**

```js
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd validator && node --test test/server.test.js`
Expected: FAIL — `Cannot find module '../server.js'`.

- [ ] **Step 4: Implement `validator/server.js`**

```js
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { listAnimationFiles } from './lib/files.js';
import { detect } from './lib/detect.js';
import { readOriginal, readDraft, computeDiff, applyDraft, discardDraft } from './lib/drafts.js';
import { runFix } from './lib/fix.js';
import { FIX_OPTIONS } from './lib/prompt.js';
import { loadSpecText } from './lib/spec.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(rootDir) {
  const root = resolve(rootDir);
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(express.static(join(__dirname, 'public')));

  const bad = (res, msg) => res.status(400).json({ error: msg });

  app.get('/api/options', (_req, res) => {
    res.json({ options: FIX_OPTIONS.map(({ id, label, default: d }) => ({ id, label, default: d })) });
  });

  app.get('/api/files', async (_req, res) => {
    res.json({ files: await listAnimationFiles(root) });
  });

  app.get('/api/file', async (req, res) => {
    try {
      res.json({ source: await readOriginal(root, String(req.query.path)) });
    } catch (err) {
      bad(res, String(err.message || err));
    }
  });

  app.get('/api/draft', async (req, res) => {
    try {
      const source = await readDraft(root, String(req.query.path));
      if (source === null) return res.status(404).json({ error: 'no draft' });
      res.json({ source });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/scan', async (req, res) => {
    try {
      const all = await listAnimationFiles(root);
      const wanted = Array.isArray(req.body.paths) && req.body.paths.length
        ? all.filter((f) => req.body.paths.includes(f.path)) : all;
      const results = [];
      for (const f of wanted) {
        results.push(detect(f.path, await readOriginal(root, f.path)));
      }
      const summary = {};
      for (const r of results) summary[r.category] = (summary[r.category] || 0) + 1;
      res.json({ results, summary, total: results.length });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/fix', async (req, res) => {
    try {
      const { paths, optionIds = [], customPrompt = '' } = req.body;
      if (!Array.isArray(paths) || !paths.length) return bad(res, 'paths required');
      const specText = await loadSpecText(root);
      const files = [];
      for (const p of paths) files.push({ path: p, source: await readOriginal(root, p) });
      const results = await runFix(root, files, { optionIds, customPrompt, specText });
      res.json({ results });
    } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
  });

  app.get('/api/diff', async (req, res) => {
    try {
      const p = String(req.query.path);
      const draft = await readDraft(root, p);
      if (draft === null) return res.status(404).json({ error: 'no draft' });
      const original = await readOriginal(root, p);
      res.json({ parts: computeDiff(original, draft) });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/apply', async (req, res) => {
    try {
      for (const p of req.body.paths || []) await applyDraft(root, p);
      res.json({ ok: true });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/discard', async (req, res) => {
    try {
      for (const p of req.body.paths || []) await discardDraft(root, p);
      res.json({ ok: true });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  return app;
}

// Self-start when run directly (repo root is the parent of validator/).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(__dirname, '..');
  const port = process.env.PORT || 4500;
  createApp(root).listen(port, () => {
    console.log(`Interact Validator on http://localhost:${port} (root: ${root})`);
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd validator && node --test test/server.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite**

Run: `cd validator && node --test`
Expected: PASS — all tests from Tasks 1–7 green.

- [ ] **Step 7: Commit**

```bash
git add validator/server.js validator/lib/spec.js validator/test/server.test.js
git commit -m "feat(validator): express server + REST API"
```

---

### Task 8: UI (list, scan dashboard, code/preview, fix panel, diff/apply)

**Files:**
- Create: `validator/public/index.html`
- Create: `validator/public/app.js`
- Create: `validator/public/styles.css`
- Create: `validator/public/preview.js`
- Test: `validator/test/preview.test.js`

**Interfaces:**
- Consumes: all `/api/*` endpoints from Task 7.
- Produces: `injectBase(html, baseHref) -> string` (in `preview.js`, ESM, used by both the browser and the unit test) — injects a `<base href>` so iframe-previewed animations resolve relative asset URLs against the original file's directory.

- [ ] **Step 1: Write the failing test for `injectBase`**

```js
// validator/test/preview.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectBase } from '../public/preview.js';

test('injectBase inserts a base tag after <head>', () => {
  const out = injectBase('<html><head>\n<title>x</title></head></html>', '/G/');
  assert.match(out, /<head>\s*\n<base href="\/G\/">/);
});
test('injectBase prepends when no head', () => {
  assert.match(injectBase('<div>x</div>', '/G/'), /^<base href="\/G\/">/);
});
test('injectBase leaves an existing base alone', () => {
  const html = '<head><base href="/orig/"></head>';
  assert.equal(injectBase(html, '/G/'), html);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd validator && node --test test/preview.test.js`
Expected: FAIL — `Cannot find module '../public/preview.js'`.

- [ ] **Step 3: Implement `validator/public/preview.js`**

```js
// Injects a <base href> so relative asset URLs in a previewed animation
// resolve against its original directory (same technique explorer.html uses).
export function injectBase(html, baseHref) {
  if (/<base\s/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${baseHref}">`);
  }
  return `<base href="${baseHref}">\n${html}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd validator && node --test test/preview.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `validator/public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Interact Validator</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header>
    <h1>Interact Validator</h1>
    <div class="actions">
      <button id="scanBtn">Scan / Diagnose</button>
      <button id="selectAllBtn">Select all</button>
      <span id="summary" class="summary"></span>
    </div>
  </header>
  <main>
    <section id="listPane">
      <ul id="fileList"></ul>
    </section>
    <section id="detailPane">
      <div class="tabs">
        <button data-tab="preview" class="tab active">Preview</button>
        <button data-tab="code" class="tab">Code</button>
        <button data-tab="diff" class="tab">Diff</button>
      </div>
      <iframe id="preview" title="preview"></iframe>
      <pre id="code" hidden></pre>
      <div id="diff" hidden></div>
    </section>
    <aside id="fixPane">
      <h2>Fix options</h2>
      <form id="fixOptions"></form>
      <textarea id="customPrompt" placeholder="Custom instructions (optional)"></textarea>
      <button id="fixBtn">Fix selected</button>
      <div id="fixStatus"></div>
      <div class="apply-actions">
        <button id="applyBtn">Apply selected drafts</button>
        <button id="discardBtn">Discard selected drafts</button>
      </div>
    </aside>
  </main>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 6: Create `validator/public/styles.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.4 system-ui, sans-serif; color: #1a1a1a; }
header { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; border-bottom: 1px solid #ddd; }
header h1 { font-size: 16px; margin: 0; }
.actions { display: flex; gap: 8px; align-items: center; }
.summary { color: #555; font-size: 12px; }
button { cursor: pointer; padding: 6px 10px; border: 1px solid #ccc;
  background: #f7f7f7; border-radius: 6px; }
main { display: grid; grid-template-columns: 320px 1fr 300px; height: calc(100vh - 53px); }
#listPane { overflow: auto; border-right: 1px solid #eee; }
#fileList { list-style: none; margin: 0; padding: 0; }
#fileList li { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer;
  display: flex; gap: 8px; align-items: center; }
#fileList li.active { background: #eef4ff; }
.badge { font-size: 11px; padding: 1px 6px; border-radius: 10px; white-space: nowrap; }
.badge.outdated { background: #ffe6cc; }
.badge.nointeract { background: #ffd6d6; }
.badge.extrajs { background: #fff2b3; }
.badge.custom { background: #e0d6ff; }
.badge.clean { background: #cdeccd; }
.badge.draft { background: #cfe9ff; }
#detailPane { display: flex; flex-direction: column; }
.tabs { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid #eee; }
.tab.active { background: #1a1a1a; color: #fff; }
#preview { flex: 1; border: 0; width: 100%; }
#code, #diff { flex: 1; overflow: auto; margin: 0; padding: 12px;
  white-space: pre-wrap; font-family: ui-monospace, monospace; }
#diff ins { background: #d6f5d6; text-decoration: none; display: block; }
#diff del { background: #f8d6d6; text-decoration: none; display: block; }
#fixPane { border-left: 1px solid #eee; padding: 12px; overflow: auto;
  display: flex; flex-direction: column; gap: 10px; }
#customPrompt { width: 100%; min-height: 80px; }
.apply-actions { display: flex; gap: 6px; flex-wrap: wrap; }
#fixStatus { font-size: 12px; color: #555; white-space: pre-wrap; }
```

- [ ] **Step 7: Create `validator/public/app.js`**

```js
import { injectBase } from './preview.js';

const BADGE = {
  'Outdated version': 'outdated', 'Not using interact': 'nointeract',
  'Uses extra JS': 'extrajs', 'Uses customEffect': 'custom', 'Clean & current': 'clean',
};

const state = { files: [], diag: {}, drafts: new Set(), selected: new Set(), current: null };
const $ = (id) => document.getElementById(id);
const api = (path, opts) => fetch(path, opts).then((r) => r.json());

async function loadFiles() {
  const { files } = await api('/api/files');
  state.files = files;
  renderList();
}

async function loadOptions() {
  const { options } = await api('/api/options');
  $('fixOptions').innerHTML = options.map((o) =>
    `<label><input type="checkbox" name="opt" value="${o.id}" ${o.default ? 'checked' : ''}/> ${o.label}</label>`
  ).join('<br/>');
}

function renderList() {
  $('fileList').innerHTML = state.files.map((f) => {
    const d = state.diag[f.path];
    const cat = d ? d.category : '';
    const badge = cat ? `<span class="badge ${BADGE[cat]}">${cat}</span>` : '';
    const draft = state.drafts.has(f.path) ? '<span class="badge draft">draft</span>' : '';
    const checked = state.selected.has(f.path) ? 'checked' : '';
    return `<li data-path="${f.path}" class="${state.current === f.path ? 'active' : ''}">
      <input type="checkbox" class="sel" ${checked}/>
      <span class="name">${f.path}</span>${badge}${draft}</li>`;
  }).join('');
}

async function scan() {
  const { results, summary, total } = await api('/api/scan', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  state.diag = {};
  for (const r of results) state.diag[r.path] = r;
  $('summary').textContent = `${total} files · ` +
    Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join('  ·  ');
  renderList();
}

function baseHrefFor(path) {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '/' : '/' + path.slice(0, slash + 1);
}

async function showPreview(path, { draft = false } = {}) {
  const url = draft ? `/api/draft?path=${encodeURIComponent(path)}`
                    : `/api/file?path=${encodeURIComponent(path)}`;
  const { source } = await api(url);
  $('preview').srcdoc = injectBase(source, baseHrefFor(path));
  $('code').textContent = source;
}

async function showDiff(path) {
  const res = await fetch(`/api/diff?path=${encodeURIComponent(path)}`);
  if (!res.ok) { $('diff').textContent = 'No draft for this file.'; return; }
  const { parts } = await res.json();
  $('diff').innerHTML = parts.map((p) => {
    const safe = p.value.replace(/</g, '&lt;');
    if (p.added) return `<ins>${safe}</ins>`;
    if (p.removed) return `<del>${safe}</del>`;
    return `<span>${safe}</span>`;
  }).join('');
}

function selectTab(tab) {
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === tab);
  $('preview').hidden = tab !== 'preview';
  $('code').hidden = tab !== 'code';
  $('diff').hidden = tab !== 'diff';
  if (state.current && tab === 'diff') showDiff(state.current);
  if (state.current && tab === 'preview') {
    showPreview(state.current, { draft: state.drafts.has(state.current) });
  }
}

async function runFix() {
  const paths = [...state.selected];
  if (!paths.length) { $('fixStatus').textContent = 'Select files first.'; return; }
  const optionIds = [...document.querySelectorAll('input[name=opt]:checked')].map((c) => c.value);
  const customPrompt = $('customPrompt').value;
  $('fixStatus').textContent = `Fixing ${paths.length} file(s)…`;
  const { results, error } = await api('/api/fix', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths, optionIds, customPrompt }) });
  if (error) { $('fixStatus').textContent = `Error: ${error}`; return; }
  for (const r of results) if (r.status !== 'fixFailed') state.drafts.add(r.path);
  $('fixStatus').textContent = results.map((r) =>
    `${r.status === 'fixed' ? '✓' : r.status === 'needsReview' ? '⚠' : '✗'} ${r.path}` +
    (r.error ? ` — ${r.error}` : '')).join('\n');
  renderList();
}

async function applyOrDiscard(endpoint) {
  const paths = [...state.selected].filter((p) => state.drafts.has(p));
  if (!paths.length) { $('fixStatus').textContent = 'No drafts in selection.'; return; }
  await api(`/api/${endpoint}`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paths }) });
  for (const p of paths) state.drafts.delete(p);
  $('fixStatus').textContent = `${endpoint === 'apply' ? 'Applied' : 'Discarded'} ${paths.length} draft(s).`;
  renderList();
  if (state.current && paths.includes(state.current)) showPreview(state.current);
}

$('fileList').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  const path = li.dataset.path;
  if (e.target.classList.contains('sel')) {
    if (state.selected.has(path)) state.selected.delete(path); else state.selected.add(path);
    return;
  }
  state.current = path;
  renderList();
  selectTab('preview');
});
$('scanBtn').onclick = scan;
$('selectAllBtn').onclick = () => {
  if (state.selected.size === state.files.length) state.selected.clear();
  else state.files.forEach((f) => state.selected.add(f.path));
  renderList();
};
$('fixBtn').onclick = runFix;
$('applyBtn').onclick = () => applyOrDiscard('apply');
$('discardBtn').onclick = () => applyOrDiscard('discard');
for (const b of document.querySelectorAll('.tab')) b.onclick = () => selectTab(b.dataset.tab);

loadFiles();
loadOptions();
```

- [ ] **Step 8: Manual smoke test (UI + a real agent fix)**

Run: `cd validator && npm start`
Then in a browser open `http://localhost:4500` and verify, in order:
1. The file list loads (grouped paths visible). — Expected: ~130 files listed.
2. Click **Scan / Diagnose**. — Expected: badges appear per file; summary bar shows counts per category (e.g. "Outdated version: N").
3. Click a file → **Preview** tab renders it in the iframe; **Code** tab shows source.
4. Check one outdated file's checkbox, ensure **Update to latest version** + **Migrate old syntax** are checked, click **Fix selected**. — Expected: status shows `✓` or `⚠`, a "draft" badge appears on that file.
5. Open the **Diff** tab for that file. — Expected: red/green line diff of original vs draft (e.g. the `@wix/interact@X` version line changes to `2.4.0`).
6. With the file still selected, click **Apply selected drafts**. — Expected: status "Applied 1 draft(s)"; `git status` shows the original file modified; the `.drafts/` entry is gone.
7. `git checkout -- <that file>` to restore it after the smoke test.

- [ ] **Step 9: Add `.drafts/` to gitignore**

Append `validator/.drafts/` and `validator/node_modules/` to the repo's `.gitignore` (create the file if missing).

- [ ] **Step 10: Commit**

```bash
git add validator/public/index.html validator/public/app.js validator/public/styles.css validator/public/preview.js validator/test/preview.test.js .gitignore
git commit -m "feat(validator): validator UI with scan, preview, diff, and apply"
```

---

## Self-Review Notes

- **Spec coverage:** file list + code view + preview (Task 8) ✔; scan/diagnose + summary with percentages-by-count (Tasks 2, 7, 8) ✔; selection + preset options + custom prompt with hidden fragments (Tasks 4, 8) ✔; Agent SDK via local Claude Code auth (Task 5) ✔; sidecar drafts + diff + preview + apply, git as undo (Tasks 3, 7, 8) ✔; bounded concurrency + post-fix self-check + per-file error handling (Task 6) ✔; path-traversal rejection (Tasks 3, 7) ✔; `explorer.html` untouched, new code under `validator/` ✔; "Remove extra JS" defaults off (Task 4) ✔.
- **Out of scope (per spec):** `@wix/interact-validate` zod integration, auto-commit on apply, remote hosting — intentionally omitted.
- **Type consistency:** `Diagnosis` shape is identical across `detect.js`, `fix.js`, and the server; `Result.status` values (`fixed`/`needsReview`/`fixFailed`) are consistent between `fix.js` and `app.js`; draft functions (`writeDraft`/`readDraft`/`applyDraft`/`discardDraft`/`computeDiff`) match between `drafts.js`, `fix.js`, and `server.js`; `injectBase` signature matches between `preview.js` and `app.js`.
