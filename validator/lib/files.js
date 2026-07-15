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
