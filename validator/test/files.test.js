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
