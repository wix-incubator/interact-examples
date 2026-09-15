// validator/lib/refinery.js — autonomous refinement engine.
// This file starts with the pure core (decide/historyBlock/extractTriggers);
// the job runner + queue are added by a later task.

const scoreOf = (it) => (it.judge && typeof it.judge.score === 'number' ? it.judge.score : null);

// Stop rule: green at threshold; amber on plateau (two consecutive iterations
// without a NEW BEST score — errors count as non-improving); amber at the cap.
export function decide({ iterations, stop }) {
  const last = scoreOf(iterations[iterations.length - 1]);
  if (last !== null && last >= stop.threshold) return { action: 'stop', status: 'green', reason: null };

  let best = -Infinity, sinceBest = 0;
  for (const it of iterations) {
    const s = scoreOf(it);
    if (s !== null && s > best) { best = s; sinceBest = 0; }
    else sinceBest++;
  }
  if (iterations.length >= stop.maxIters) return { action: 'stop', status: 'amber', reason: 'cap' };
  if (sinceBest >= stop.plateau) return { action: 'stop', status: 'amber', reason: 'plateau' };
  return { action: 'continue' };
}

// Compact cross-iteration memory for the refiner (explicit, never a session).
export function historyBlock(iterations) {
  return (iterations || []).map((it) => {
    const s = scoreOf(it);
    if (s === null) return `iter ${it.iter} → judge failed`;
    const note = String(it.judge.notes || '').split('\n')[0].slice(0, 200);
    return `iter ${it.iter} → ${s}/10: ${note}`;
  }).join('\n');
}

// Trigger types used by the original example (told to the judge: scroll sweeps
// can't show hover/click states, so it must not penalize them).
export function extractTriggers(source) {
  const out = [];
  for (const m of String(source).matchAll(/trigger:\s*['"](\w+)['"]/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

// ── Engine: queue (concurrency 2) + per-job iteration loop ─────────────────
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createJob, saveJob, getJob, jobDir, finalGuideline, examplePathFor } from './jobs-store.js';
import { readPrompt } from './prompts.js';

export function createRefinery({ runsDir, rootDir, port = process.env.PORT || 4500, deps = {} }) {
  const emitters = new Map();          // jobId -> EventEmitter
  const stopFlags = new Set();         // jobIds asked to stop after the current iteration
  const queue = [];                    // jobIds waiting
  let active = 0;
  const CONCURRENCY = 2;

  const events = (id) => { if (!emitters.has(id)) emitters.set(id, new EventEmitter()); return emitters.get(id); };
  const emit = (id, type, data = {}) => events(id).emit('event', { type, ...data });

  const readExample = deps.readExampleImpl || ((rel) => readFile(resolve(rootDir, rel), 'utf8'));

  async function runIteration(job, guideline, sectionMetas) {
    const iter = job.iterations.length + 1;
    const iterRec = { iter, guideline, sections: [], judge: null, refined: null };

    // 1) generate (bounded by section count; per-section isolation)
    emit(job.id, 'step', { iter, step: 'generate' });
    await Promise.all(sectionMetas.map(async (s) => {
      try {
        const { config } = await deps.generateImpl({ html: s.promptHtml || s.html, css: s.css, guideline });
        iterRec.sections.push({ id: s.id, config, html: s.html, css: s.css, frames: [], gif: null, error: null });
      } catch (err) {
        iterRec.sections.push({ id: s.id, config: null, html: s.html, css: s.css, frames: [], gif: null, error: String(err.message || err) });
      }
    }));
    iterRec.sections.sort((a, b) => a.id.localeCompare(b.id));
    job.iterations.push(iterRec);
    await saveJob(runsDir, job);
    if (iterRec.sections.every((s) => s.error)) return { failed: 'generate-error' };

    // 2) capture each generated section (served by our own /render route)
    emit(job.id, 'step', { iter, step: 'capture' });
    for (const s of iterRec.sections) {
      if (s.error) continue;
      const outDir = join(jobDir(runsDir, job.id), `iter-${iter}`, s.id);
      try {
        const { frames, gif } = await deps.captureImpl(
          `http://localhost:${port}/render/${job.id}/${iter}/${encodeURIComponent(s.id)}`, outDir);
        s.frames = frames; s.gif = gif;
      } catch (err) {
        try {   // one retry per spec
          const { frames, gif } = await deps.captureImpl(
            `http://localhost:${port}/render/${job.id}/${iter}/${encodeURIComponent(s.id)}`, outDir);
          s.frames = frames; s.gif = gif;
        } catch (err2) { return { failed: 'capture-error', detail: String(err2.message || err2) }; }
      }
    }
    await saveJob(runsDir, job);

    // 3) judge (fresh subprocess; retry lives inside judgeIteration)
    emit(job.id, 'step', { iter, step: 'judge' });
    try {
      iterRec.judge = await deps.judgeImpl({
        guideline,
        exampleSource: job._exampleSource,
        exampleTriggers: job._exampleTriggers,
        originalFrames: job._originalFrames,
        sections: iterRec.sections.map((s) => ({ id: s.id, frames: s.frames, config: s.config, error: s.error })),
      }, { addDir: jobDir(runsDir, job.id), onDelta: (t, kind) => emit(job.id, 'log', { text: t, kind }) });
    } catch (err) {
      iterRec.judge = { error: String(err.message || err) };
      await saveJob(runsDir, job);
      return { failed: 'judge-error' };
    }
    await saveJob(runsDir, job);
    emit(job.id, 'iteration', { iter, score: iterRec.judge.score });

    // 4) decide
    const verdict = decide({ iterations: job.iterations, stop: job.stop });
    if (verdict.action === 'stop') return { verdict };
    if (stopFlags.has(job.id)) { stopFlags.delete(job.id); return { verdict: { action: 'stop', status: 'amber', reason: 'interrupted' } }; }

    // 5) refine (explicit curated memory; userNotes consumed once)
    emit(job.id, 'step', { iter, step: 'refine' });
    const refined = await deps.refineImpl({
      guideline, score: iterRec.judge.score, notes: iterRec.judge.notes,
      history: historyBlock(job.iterations),
      userNotes: job.userNotes,
      onDelta: (t, kind) => emit(job.id, 'log', { text: t, kind }),
    });
    if (job.userNotes) { job.userNotes = null; }
    iterRec.refined = refined;
    await saveJob(runsDir, job);
    return { next: refined };
  }

  async function runJob(id) {
    const job = await getJob(runsDir, id);
    if (!job) return;
    job.status = 'running';
    await saveJob(runsDir, job);
    emit(id, 'status', { status: 'running' });
    try {
      // Per-job cached context: example source/triggers + original capture (once).
      job._exampleSource = await readExample(job.examplePath);
      job._exampleTriggers = extractTriggers(job._exampleSource);
      const origDir = join(jobDir(runsDir, id), 'original');
      // Reuse a previous run's original capture (persisted as job.originalFrames).
      job._originalFrames = job.originalFrames?.length ? job.originalFrames : null;
      if (!job._originalFrames) {
        emit(id, 'step', { iter: 0, step: 'capture-original' });
        const { frames } = await deps.captureImpl(
          `http://localhost:${port}/repo/${job.examplePath.split('/').map(encodeURIComponent).join('/')}`, origDir);
        job._originalFrames = frames;
      }
      const all = await deps.listSectionsImpl();
      const chosen = all.filter((s) => job.sections.includes(s.id));
      if (!chosen.length) throw new Error('none of the selected sections exist');

      // Resume: continue from the last refined guideline. If the last iteration
      // was a stopping one (no refine happened), refine it now — consuming any
      // userNotes — to produce the guideline the next iteration runs with.
      let guideline;
      if (job.iterations.length) {
        const last = job.iterations[job.iterations.length - 1];
        if (last.refined) {
          guideline = last.refined;
        } else if (last.judge && typeof last.judge.score === 'number') {
          emit(id, 'step', { iter: last.iter, step: 'refine' });
          guideline = await deps.refineImpl({
            guideline: last.guideline, score: last.judge.score, notes: last.judge.notes,
            history: historyBlock(job.iterations),
            userNotes: job.userNotes,
            onDelta: (t, kind) => emit(id, 'log', { text: t, kind }),
          });
          if (job.userNotes) { job.userNotes = null; }
          last.refined = guideline;
          await saveJob(runsDir, job);
        } else {
          guideline = finalGuideline(job) ?? await readPrompt(rootDir, job.promptPath);
        }
      } else {
        guideline = await readPrompt(rootDir, job.promptPath);
      }
      if (guideline === null || guideline === undefined) throw new Error('prompt .md not found');

      for (;;) {
        const res = await runIteration(job, guideline, chosen);
        if (res.failed) { job.status = 'amber'; job.amberReason = res.failed; break; }
        if (res.verdict) { job.status = res.verdict.status; job.amberReason = res.verdict.reason || null; break; }
        guideline = res.next;
      }
    } catch (err) {
      job.status = 'failed';
      job.error = String(err.message || err);
    }
    // Strip the per-run cache before persisting (frames of the original ARE persisted).
    const { _exampleSource, _exampleTriggers, ...rest } = job;
    rest.originalFrames = job._originalFrames || rest.originalFrames || [];
    delete rest._originalFrames;
    await saveJob(runsDir, rest);
    emit(id, 'status', { status: rest.status, reason: rest.amberReason });
    emit(id, 'end');
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const id = queue.shift();
      active++;
      runJob(id).finally(() => { active--; pump(); });
    }
  }

  return {
    deps, events, concurrency: CONCURRENCY,
    async launch({ promptPaths, sections }) {
      const jobs = [], errors = [];
      for (const promptPath of promptPaths) {
        try {
          const examplePath = examplePathFor(promptPath);
          if (await readPrompt(rootDir, promptPath) === null) throw new Error('prompt .md not found');
          await readExample(examplePath);   // throws if the example file is missing
          const job = await createJob(runsDir, { promptPath, examplePath, sections });
          jobs.push(job); queue.push(job.id);
        } catch (err) {
          errors.push({ promptPath, error: String(err.message || err) });
        }
      }
      pump();
      return { jobs, errors };
    },
    stop(id) { stopFlags.add(id); },
    async relaunch(id, { userNotes } = {}) {
      const job = await getJob(runsDir, id);
      if (!job) throw new Error('no such job');
      if (job.status === 'running' || job.status === 'queued') throw new Error('job is already active');
      stopFlags.delete(id);
      job.status = 'queued'; job.amberReason = null;
      if (userNotes) job.userNotes = userNotes;
      await saveJob(runsDir, job);
      queue.push(id); pump();
      return job;
    },
  };
}
