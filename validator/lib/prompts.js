import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { PROMPTS_DIR } from './constants.js';

// Map a source example path to its prompt path, RELATIVE TO the prompts dir.
// "Gallery-and-Carousel/CardSpread.html" -> "Gallery-and-Carousel/CardSpread.md"
export function promptRelPath(sourceRel) {
  return sourceRel.replace(/\.html?$/i, '.md');
}

// Resolve a prompts-dir-relative path to an absolute path, refusing anything
// that escapes the prompts directory.
function promptAbs(rootDir, rel) {
  const baseDir = resolve(rootDir, PROMPTS_DIR);
  const abs = resolve(baseDir, rel);
  if (abs !== baseDir && !abs.startsWith(baseDir + sep)) throw new Error('path escapes prompts dir');
  return abs;
}

export async function writePrompt(rootDir, sourceRel, content) {
  const rel = promptRelPath(sourceRel);
  const abs = promptAbs(rootDir, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
  return rel;
}

export async function readPrompt(rootDir, rel) {
  try {
    return await readFile(promptAbs(rootDir, rel), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writePromptRaw(rootDir, rel, content) {
  const abs = promptAbs(rootDir, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

// List every .md guideline under the prompts dir, as { path, dir, file }
// with paths relative to the prompts dir (mirrors the examples tree shape).
export async function listPrompts(rootDir) {
  const base = resolve(rootDir, PROMPTS_DIR);
  const out = [];
  async function walk(absDir) {
    let entries;
    try { entries = await readdir(absDir, { withFileTypes: true }); }
    catch { return; } // dir may not exist yet
    for (const entry of entries) {
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const rel = relative(base, abs).split(sep).join('/');
        const slash = rel.lastIndexOf('/');
        out.push({
          path: rel,
          dir: slash === -1 ? '' : rel.slice(0, slash),
          file: slash === -1 ? rel : rel.slice(slash + 1),
        });
      }
    }
  }
  await walk(base);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
