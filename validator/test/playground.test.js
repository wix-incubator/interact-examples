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

test('listSections returns raw html for render and sanitized promptHtml for the model', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'iv-sec-'));
  await mkdir(join(dir, 'cards'), { recursive: true });
  await writeFile(join(dir, 'cards', 'section.html'), '<raw>');
  await writeFile(join(dir, 'cards', 'section.sanitized.html'), '<clean>');
  await writeFile(join(dir, 'cards', 'section.css'), '.c{}');
  await mkdir(join(dir, 'hero'), { recursive: true });
  await writeFile(join(dir, 'hero', 'section.html'), '<hero>');
  const secs = await listSections(dir);
  const cards = secs.find((s) => s.id === 'cards');
  assert.equal(cards.html, '<raw>');          // real markup → rendered
  assert.equal(cards.promptHtml, '<clean>');  // sanitized copy → model prompt
  assert.equal(cards.css, '.c{}');
  const hero = secs.find((s) => s.id === 'hero');
  assert.equal(hero.html, '<hero>');
  assert.equal(hero.promptHtml, '<hero>');    // no sanitized file → falls back to raw
  assert.equal(hero.css, '');                 // missing css → empty
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
