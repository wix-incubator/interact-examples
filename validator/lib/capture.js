// validator/lib/capture.js — headless scroll-sweep capture: PNG frames + a GIF.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
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
