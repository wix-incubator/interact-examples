import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConvertPrompt, convertFile, runConvert } from '../lib/convert.js';
import { promptRelPath, readPrompt, listPrompts } from '../lib/prompts.js';

const root = () => mkdtemp(join(tmpdir(), 'iv-conv-'));

test('promptRelPath maps .html source to .md under the prompts dir', () => {
  assert.equal(promptRelPath('Gallery-and-Carousel/CardSpread.html'), 'Gallery-and-Carousel/CardSpread.md');
  assert.equal(promptRelPath('label.htm'), 'label.md');
});

test('buildConvertPrompt embeds the skill, exemplar, and source', () => {
  const { system, user } = buildConvertPrompt({
    skill: 'SKILL-BODY', exemplar: 'EXEMPLAR-BODY', relPath: 'a/b.html', source: '<html>SRC</html>' });
  assert.match(system, /SKILL-BODY/);
  assert.match(system, /EXEMPLAR-BODY/);
  assert.match(system, /ONLY the finished guideline/i);
  assert.match(user, /a\/b\.html/);
  assert.match(user, /SRC/);
});

test('convertFile writes the guideline to the mirrored prompt path', async () => {
  const r = await root();
  const res = await convertFile(r, 'Gallery-and-Carousel/CardSpread.html', {
    source: '<html></html>', skill: 'S', exemplar: 'E',
    runAgent: async () => '# Card Spread\n\nA guideline.',
  });
  assert.equal(res.status, 'converted');
  assert.equal(res.via, 'agent');
  assert.equal(res.outPath, 'Gallery-and-Carousel/CardSpread.md');
  assert.equal(await readPrompt(r, 'Gallery-and-Carousel/CardSpread.md'), '# Card Spread\n\nA guideline.');
});

test('convertFile strips a whole-document markdown fence', async () => {
  const r = await root();
  await convertFile(r, 'x.html', { source: 'x', skill: 'S', exemplar: 'E',
    runAgent: async () => '```markdown\n# Title\ntext\n```' });
  assert.equal(await readPrompt(r, 'x.md'), '# Title\ntext');
});

test('convertFile reports failed and writes nothing when the agent throws', async () => {
  const r = await root();
  const res = await convertFile(r, 'y.html', { source: 'x', skill: 'S', exemplar: 'E',
    runAgent: async () => { throw new Error('boom'); } });
  assert.equal(res.status, 'failed');
  assert.match(res.error, /boom/);
  assert.equal(await readPrompt(r, 'y.md'), null);
});

test('runConvert processes a batch and listPrompts finds the results', async () => {
  const r = await root();
  await runConvert(r, [{ path: 'a/one.html', source: 's' }, { path: 'two.html', source: 's' }],
    { skill: 'S', exemplar: 'E', runAgent: async () => '# G', concurrency: 2 });
  const prompts = await listPrompts(r);
  assert.deepEqual(prompts.map((p) => p.path).sort(), ['a/one.md', 'two.md']);
  assert.equal(prompts.find((p) => p.path === 'a/one.md').dir, 'a');
});

test('readPrompt refuses path traversal out of the prompts dir', async () => {
  const r = await root();
  await assert.rejects(() => readPrompt(r, '../../etc/passwd'), /escapes prompts dir/);
});
