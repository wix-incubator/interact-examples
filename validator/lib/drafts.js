import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { resolve, sep, dirname, relative } from 'node:path';
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

// List every draft file under DRAFTS_DIR as root-relative posix paths, so the
// UI can hydrate its draft set on load (drafts live on disk across restarts;
// the client's in-memory set would otherwise start empty after a refresh).
export async function listDrafts(rootDir) {
  const base = resolve(rootDir, DRAFTS_DIR);
  const out = [];
  async function walk(absDir) {
    let entries;
    try { entries = await readdir(absDir, { withFileTypes: true }); }
    catch { return; } // dir may not exist yet
    for (const entry of entries) {
      const abs = resolve(absDir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile()) out.push(relative(base, abs).split(sep).join('/'));
    }
  }
  await walk(base);
  return out.sort();
}
