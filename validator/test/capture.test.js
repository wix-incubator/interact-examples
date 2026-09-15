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
