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
// a clean, latest-version, no-customEffect snippet
const CLEAN = `import {Interact} from 'https://esm.sh/@wix/interact@2.5.1/web';
  Interact.create({ interactions:[{ key:'a', trigger:'hover',
    effects:[{ namedEffect:{type:'FadeIn'}, duration:300, triggerType:'once' }] }] });`;

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

test('updateVersion is done by codemod (no agent) and pins the version', async () => {
  const r = await root();
  const src = `import {Interact} from 'https://esm.sh/@wix/interact@1.79.0';
    Interact.create({ interactions:[{ key:'a', trigger:'hover',
      effects:[{ namedEffect:{type:'FadeIn'}, duration:300, triggerType:'once' }] }] });`;
  let agentCalled = false;
  const res = await fixFile(r, 'A.html', {
    source: src, optionIds: ['updateVersion'], customPrompt: '', specText: SPEC,
    runAgent: async () => { agentCalled = true; return 'UNUSED'; },
  });
  assert.equal(agentCalled, false, 'agent must not be called for a pure version bump');
  assert.equal(res.via, 'script');
  assert.equal(res.status, 'fixed');
  const draft = await readDraft(r, 'A.html');
  assert.match(draft, /@wix\/interact@2\.5\.1\/web/);
  assert.doesNotMatch(draft, /@1\.79\.0/);
});

test('migrateSyntax with only a tag rename is done by codemod (no agent)', async () => {
  const r = await root();
  const src = `<wix-interact-element data-interact-key="a"><div>x</div></wix-interact-element>
    import {Interact} from 'https://esm.sh/@wix/interact@2.5.1/web';
    Interact.create({ interactions:[{ key:'a', trigger:'hover',
      effects:[{ namedEffect:{type:'FadeIn'}, duration:300, triggerType:'once' }] }] });`;
  let agentCalled = false;
  const res = await fixFile(r, 'B.html', {
    source: src, optionIds: ['migrateSyntax'], customPrompt: '', specText: SPEC,
    runAgent: async () => { agentCalled = true; return 'UNUSED'; },
  });
  assert.equal(agentCalled, false);
  assert.equal(res.via, 'script');
  assert.doesNotMatch(await readDraft(r, 'B.html'), /wix-interact-element/);
});

test('migrateSyntax with play-mode still needs the agent', async () => {
  const r = await root();
  const src = `import {Interact} from 'https://esm.sh/@wix/interact@2.5.1/web';
    Interact.create({ interactions:[{ key:'a', trigger:'hover', params:{ method:'toggle' },
      effects:[{ customEffect:()=>{} }] }] });`;
  let agentCalled = false;
  const res = await fixFile(r, 'C.html', {
    source: src, optionIds: ['migrateSyntax'], customPrompt: '', specText: SPEC,
    runAgent: async () => { agentCalled = true; return CLEAN; },
  });
  assert.equal(agentCalled, true, 'params.method play-mode is a structural change → agent');
  assert.equal(res.via, 'agent');
  assert.equal(res.status, 'fixed');
});

test('a semantic option (convertToInteract) calls the agent', async () => {
  const r = await root();
  let agentCalled = false;
  const res = await fixFile(r, 'D.html', {
    source: '<div>plain html, no interact</div>', optionIds: ['convertToInteract'], customPrompt: '', specText: SPEC,
    runAgent: async () => { agentCalled = true; return CLEAN; },
  });
  assert.equal(agentCalled, true);
  assert.equal(res.via, 'agent');
  assert.equal(res.status, 'fixed');
});

test('a non-empty custom prompt forces the agent even with only mechanical options', async () => {
  const r = await root();
  let agentCalled = false;
  await fixFile(r, 'E.html', {
    source: CLEAN, optionIds: ['updateVersion'], customPrompt: 'make the cards bigger', specText: SPEC,
    runAgent: async () => { agentCalled = true; return CLEAN; },
  });
  assert.equal(agentCalled, true);
});

test('fixFile reports fixFailed and writes no draft when the agent throws', async () => {
  const r = await root();
  const res = await fixFile(r, 'F.html', {
    source: 'x', optionIds: ['convertToInteract'], customPrompt: '', specText: SPEC,
    runAgent: async () => { throw new Error('boom'); },
  });
  assert.equal(res.status, 'fixFailed');
  assert.match(res.error, /boom/);
  assert.equal(await readDraft(r, 'F.html'), null);
});

test('fixFile reports needsReview when the agent draft is still outdated', async () => {
  const r = await root();
  const res = await fixFile(r, 'G.html', {
    source: 'x', optionIds: ['convertToInteract'], customPrompt: '', specText: SPEC,
    runAgent: async () => `import {Interact} from 'https://esm.sh/@wix/interact@1.79.0';`,
  });
  assert.equal(res.status, 'needsReview');
});

test('fixFile reports needsReview when convertCustomEffect requested but draft still uses customEffect', async () => {
  const r = await root();
  const draftWithCustomEffect = `import {Interact} from 'https://esm.sh/@wix/interact@2.5.1/web';
    Interact.create({ interactions:[{ key:'a', trigger:'hover',
      effects:[{ customEffect: (el, p) => { el.style.opacity = p; }, duration:300, triggerType:'once' }] }] });`;
  const res = await fixFile(r, 'H.html', {
    source: 'OLD', optionIds: ['convertCustomEffect'], customPrompt: '', specText: SPEC,
    runAgent: async () => draftWithCustomEffect,
  });
  assert.equal(res.status, 'needsReview');
});

test('runFix processes a batch', async () => {
  const r = await root();
  const results = await runFix(r,
    [{ path: 'A.html', source: 'x' }, { path: 'B.html', source: 'y' }],
    { optionIds: ['updateVersion'], customPrompt: '', specText: SPEC,
      runAgent: async () => 'UNUSED', concurrency: 2 });
  assert.equal(results.length, 2);
});
