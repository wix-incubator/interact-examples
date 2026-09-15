import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

// 'G/Card.md' -> 'G/Card.html' (inverse of prompts.js promptRelPath).
export function examplePathFor(promptRel) {
  return promptRel.replace(/\.md$/i, '.html');
}

export function jobDir(runsDir, id) {
  if (!/^j[a-z0-9]+$/.test(id)) throw new Error(`bad job id: ${id}`);
  const abs = resolve(runsDir, id);
  const base = resolve(runsDir);
  if (!abs.startsWith(base + sep)) throw new Error('job path escapes runs dir');
  return abs;
}

const newId = () => `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function saveJob(runsDir, job) {
  job.updatedAt = new Date().toISOString();
  const dir = jobDir(runsDir, job.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'job.json'), JSON.stringify(job, null, 2), 'utf8');
}

export async function createJob(runsDir, { promptPath, examplePath, sections, stop }) {
  const job = {
    id: newId(), promptPath, examplePath, sections,
    status: 'queued', amberReason: null, userNotes: null,
    stop: { threshold: 8, maxIters: 5, plateau: 2, ...(stop || {}) },
    iterations: [],
    createdAt: new Date().toISOString(), updatedAt: null,
  };
  await saveJob(runsDir, job);
  return job;
}

export async function getJob(runsDir, id) {
  try { return JSON.parse(await readFile(join(jobDir(runsDir, id), 'job.json'), 'utf8')); }
  catch { return null; }
}

// Delete a job and all its artifacts (frames/gifs) — a fresh start for that
// prompt. Path-safe via jobDir. Idempotent: a missing job is a no-op.
export async function deleteJob(runsDir, id) {
  await rm(jobDir(runsDir, id), { recursive: true, force: true });
}

export async function listJobs(runsDir) {
  let entries;
  try { entries = await readdir(runsDir, { withFileTypes: true }); }
  catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || !/^j[a-z0-9]+$/.test(e.name)) continue;
    const job = await getJob(runsDir, e.name);
    if (job) out.push(job);
  }
  return out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// Boot recovery: execution died with the server; the records survive.
export async function markInterrupted(runsDir) {
  let n = 0;
  for (const job of await listJobs(runsDir)) {
    if (job.status === 'running' || job.status === 'queued') {
      job.status = 'amber'; job.amberReason = 'interrupted';
      await saveJob(runsDir, job); n++;
    }
  }
  return n;
}

// The guideline the user approves: best judge score, latest wins ties.
export function finalGuideline(job) {
  let best = null;
  for (const it of job.iterations || []) {
    const s = it.judge && typeof it.judge.score === 'number' ? it.judge.score : null;
    if (s === null) continue;
    if (!best || s >= best.score) best = { score: s, guideline: it.guideline };
  }
  return best ? best.guideline : null;
}
