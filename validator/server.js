import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { listAnimationFiles } from './lib/files.js';
import { detect } from './lib/detect.js';
import { readOriginal, readDraft, computeDiff, applyDraft, discardDraft, listDrafts } from './lib/drafts.js';
import { runFix } from './lib/fix.js';
import { runConvert } from './lib/convert.js';
import { listPrompts, readPrompt, writePromptRaw } from './lib/prompts.js';
import { loadConvertSkill } from './lib/skill.js';
import { FIX_OPTIONS } from './lib/prompt.js';
import { loadSpecText } from './lib/spec.js';
import { listSections, generate, pingStatus } from './lib/playground.js';
import { readLoop, recordRound, rollback, finalize, roundRefined } from './lib/loop-store.js';
import { getAgentState, setModelOverride, resetTotals } from './lib/agent-state.js';
import { refineGuideline } from './lib/refine.js';
import { createRefinery } from './lib/refinery.js';
import { getJob as getRefineryJob, listJobs as listRefineryJobs, saveJob as saveRefineryJob, deleteJob as deleteRefineryJob, markInterrupted, finalGuideline } from './lib/jobs-store.js';
import { captureSweep } from './lib/capture.js';
import { judgeIteration } from './lib/judge.js';
import { buildRenderDoc } from './public/render-frame.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(rootDir, { port } = {}) {
  const root = resolve(rootDir);
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(express.static(join(__dirname, 'public')));
  app.use('/vendor', (_req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); }, express.static(join(__dirname, 'vendor')));

  const RUNS_DIR = join(__dirname, 'runs');
  app.use('/runs', express.static(RUNS_DIR));
  app.use('/repo', express.static(root, { index: false }));   // read-only originals for capture + reference

  const refinery = createRefinery({ runsDir: RUNS_DIR, rootDir: root, port, deps: {
    listSectionsImpl: listSections,
    generateImpl: generate,
    captureImpl: captureSweep,
    judgeImpl: judgeIteration,
    refineImpl: refineGuideline,
  } });
  // Boot recovery: execution died with the previous process; records survive.
  markInterrupted(RUNS_DIR).catch(() => {});

  const bad = (res, msg) => res.status(400).json({ error: msg });

  app.get('/api/options', (_req, res) => {
    res.json({ options: FIX_OPTIONS.map(({ id, label, default: d }) => ({ id, label, default: d })) });
  });

  app.get('/api/files', async (_req, res) => {
    res.json({ files: await listAnimationFiles(root) });
  });

  app.get('/api/file', async (req, res) => {
    try {
      res.json({ source: await readOriginal(root, String(req.query.path)) });
    } catch (err) {
      bad(res, String(err.message || err));
    }
  });

  app.get('/api/drafts', async (_req, res) => {
    try {
      res.json({ paths: await listDrafts(root) });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.get('/api/draft', async (req, res) => {
    try {
      const source = await readDraft(root, String(req.query.path));
      if (source === null) return res.status(404).json({ error: 'no draft' });
      res.json({ source });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/scan', async (req, res) => {
    try {
      const all = await listAnimationFiles(root);
      const wanted = Array.isArray(req.body.paths) && req.body.paths.length
        ? all.filter((f) => req.body.paths.includes(f.path)) : all;
      const results = [];
      for (const f of wanted) {
        results.push(detect(f.path, await readOriginal(root, f.path)));
      }
      const summary = {};
      for (const r of results) summary[r.category] = (summary[r.category] || 0) + 1;
      res.json({ results, summary, total: results.length });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/fix', async (req, res) => {
    const { paths, optionIds = [], customPrompt = '' } = req.body;
    if (!Array.isArray(paths) || !paths.length) return bad(res, 'paths required');
    const specText = await loadSpecText(root);

    // Read sources defensively — a bad path becomes a fixFailed result.
    const files = [];
    const readFailures = [];
    for (const p of paths) {
      try {
        files.push({ path: p, source: await readOriginal(root, p) });
      } catch (err) {
        readFailures.push({ path: p, status: 'fixFailed', error: String(err.message || err) });
      }
    }

    // Streaming mode: emit a result per file as it finishes (Server-Sent
    // Events) so the UI can show live progress. Opt-in via Accept header.
    if ((req.headers.accept || '').includes('text/event-stream')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('start', { total: paths.length, paths });
      for (const rf of readFailures) send('result', rf);
      try {
        await runFix(root, files, { optionIds, customPrompt, specText,
          onResult: (r) => send('result', r),
          onLog: (path, text, kind) => send('log', { path, text, kind }) });
        send('done', { ok: true });
      } catch (err) {
        send('error', { error: String(err.message || err) });
      }
      return res.end();
    }

    // Non-streaming mode (default): one JSON response with all results.
    try {
      const fixResults = await runFix(root, files, { optionIds, customPrompt, specText });
      res.json({ results: [...readFailures, ...fixResults] });
    } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
  });

  app.get('/api/diff', async (req, res) => {
    try {
      const p = String(req.query.path);
      const draft = await readDraft(root, p);
      if (draft === null) return res.status(404).json({ error: 'no draft' });
      const original = await readOriginal(root, p);
      res.json({ parts: computeDiff(original, draft) });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/apply', async (req, res) => {
    const results = [];
    for (const p of req.body.paths || []) {
      try {
        await applyDraft(root, p);
        results.push({ path: p, ok: true });
      } catch (err) {
        results.push({ path: p, ok: false, error: String(err.message || err) });
      }
    }
    res.json({ results });
  });

  app.post('/api/discard', async (req, res) => {
    const results = [];
    for (const p of req.body.paths || []) {
      try {
        await discardDraft(root, p);
        results.push({ path: p, ok: true });
      } catch (err) {
        results.push({ path: p, ok: false, error: String(err.message || err) });
      }
    }
    res.json({ results });
  });

  // ── Prompts (convert-to-prompt output) ─────────────
  app.get('/api/prompts', async (_req, res) => {
    res.json({ files: await listPrompts(root) });
  });

  app.get('/api/prompt', async (req, res) => {
    try {
      const source = await readPrompt(root, String(req.query.path));
      if (source === null) return res.status(404).json({ error: 'no prompt' });
      res.json({ source });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/convert', async (req, res) => {
    const { paths } = req.body;
    if (!Array.isArray(paths) || !paths.length) return bad(res, 'paths required');
    const { skill, exemplar } = await loadConvertSkill();

    const files = [];
    const readFailures = [];
    for (const p of paths) {
      try { files.push({ path: p, source: await readOriginal(root, p) }); }
      catch (err) { readFailures.push({ path: p, status: 'failed', error: String(err.message || err) }); }
    }

    if ((req.headers.accept || '').includes('text/event-stream')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('start', { total: paths.length, paths });
      for (const rf of readFailures) send('result', rf);
      try {
        await runConvert(root, files, { skill, exemplar,
          onResult: (r) => send('result', r),
          onLog: (path, text) => send('log', { path, text }) });
        send('done', { ok: true });
      } catch (err) { send('error', { error: String(err.message || err) }); }
      return res.end();
    }

    try {
      const results = await runConvert(root, files, { skill, exemplar });
      res.json({ results: [...readFailures, ...results] });
    } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
  });

  app.get('/api/playground/status', async (_req, res) => { res.json({ up: await pingStatus({}) }); });

  app.get('/api/playground/sections', async (_req, res) => {
    const sections = await listSections();
    // Include the real (raw) html + css so the UI can preview a section's
    // original layout before any guideline is generated against it.
    res.json({ sections: sections.map((s) => ({ id: s.id, html: s.html, css: s.css })) });
  });

  app.get('/api/loop', async (req, res) => {
    try { res.json(await readLoop(root, String(req.query.promptPath))); }
    catch (err) { bad(res, String(err.message || err)); }
  });

  // Diff the original .md guideline against the current working version
  // (default) or against the guideline a specific round PRODUCED (?round=K).
  app.get('/api/loop/diff', async (req, res) => {
    try {
      const promptPath = String(req.query.promptPath);
      const [original, loop] = await Promise.all([readPrompt(root, promptPath), readLoop(root, promptPath)]);
      if (original === null) return res.status(404).json({ error: 'no prompt' });
      let target = loop.working ?? '';
      if (req.query.round) {
        const refined = roundRefined(loop, Number(req.query.round));
        if (refined === null) return bad(res, `no round ${req.query.round}`);
        target = refined;
      }
      res.json({ changed: original !== target, parts: computeDiff(original, target) });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  // ── Agent runtime (model override + token accounting) ─────────
  app.get('/api/agent/status', (_req, res) => { res.json(getAgentState()); });
  app.post('/api/agent/model', (req, res) => { setModelOverride(req.body.model); res.json(getAgentState()); });
  app.post('/api/agent/reset', (_req, res) => { resetTotals(); res.json(getAgentState()); });

  app.post('/api/loop/run', async (req, res) => {
    const { promptPath, sections } = req.body;
    if (!promptPath || !Array.isArray(sections) || !sections.length) return bad(res, 'promptPath and sections required');
    // Resolve inputs defensively BEFORE committing to a response mode — a bad
    // promptPath (e.g. path escape) yields a clean 400, not a hung stream.
    let working, chosen;
    try {
      ({ working } = await readLoop(root, promptPath));
      const all = await listSections();
      chosen = all.filter((s) => sections.includes(s.id));
    } catch (err) { return bad(res, String(err.message || err)); }

    const runAll = async (onResult) => {
      await Promise.all(chosen.map(async (s) => {
        try {
          // Model sees the sanitized markup; the client renders the real one.
          const { config } = await generate({ html: s.promptHtml || s.html, css: s.css, guideline: working });
          onResult({ id: s.id, config, html: s.html, css: s.css });
        } catch (err) {
          onResult({ id: s.id, error: String(err.message || err) });
        }
      }));
    };

    // Streaming (opt-in via Accept), mirroring /api/fix.
    if ((req.headers.accept || '').includes('text/event-stream')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('start', { sections: chosen.map((s) => s.id) });
      await runAll((r) => send('result', r));
      send('done', { ok: true });
      return res.end();
    }

    // Non-streaming (default): one JSON response with all section results.
    try {
      const results = [];
      await runAll((r) => results.push(r));
      res.json({ results });
    } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
  });

  app.post('/api/loop/refine', async (req, res) => {
    const { promptPath, score, notes, configs } = req.body;
    if (!promptPath) return bad(res, 'promptPath required');
    let working;
    try { ({ working } = await readLoop(root, promptPath)); }
    catch (err) { return bad(res, String(err.message || err)); }
    const roundSections = Array.isArray(configs) ? configs : [];   // defensive: never persist a non-array

    // Streaming (opt-in via Accept), mirroring /api/fix.
    if ((req.headers.accept || '').includes('text/event-stream')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      try {
        const guideline = await refineGuideline({ guideline: working, score, notes, onDelta: (t) => send('log', { text: t }) });
        await recordRound(root, promptPath, { guideline: working, sections: roundSections, score, notes, newWorking: guideline });
        send('done', { guideline });
      } catch (err) { send('error', { error: String(err.message || err) }); }
      return res.end();
    }

    // Non-streaming (default): one JSON response.
    try {
      const guideline = await refineGuideline({ guideline: working, score, notes });
      await recordRound(root, promptPath, { guideline: working, sections: roundSections, score, notes, newWorking: guideline });
      res.json({ guideline });
    } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
  });

  app.post('/api/loop/finalize', async (req, res) => {
    try { await finalize(root, String(req.body.promptPath)); res.json({ ok: true }); }
    catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/loop/rollback', async (req, res) => {
    try { res.json(await rollback(root, String(req.body.promptPath), Number(req.body.round))); }
    catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/refinery/launch', async (req, res) => {
    const { promptPaths, sections } = req.body;
    if (!Array.isArray(promptPaths) || !promptPaths.length) return bad(res, 'promptPaths required');
    if (!Array.isArray(sections) || !sections.length) return bad(res, 'sections required');
    if (!(await pingStatus({}))) return bad(res, 'playground not reachable at :5173 — start it first');
    try { res.json(await refinery.launch({ promptPaths: promptPaths.map(String), sections: sections.map(String) })); }
    catch (err) { bad(res, String(err.message || err)); }
  });

  app.get('/api/refinery/jobs', async (req, res) => {
    let jobs = await listRefineryJobs(RUNS_DIR);
    if (req.query.promptPath) jobs = jobs.filter((j) => j.promptPath === String(req.query.promptPath));
    // The list view needs status, not full iteration payloads.
    res.json({ jobs: jobs.map(({ id, promptPath, status, amberReason, createdAt, updatedAt, iterations }) =>
      ({ id, promptPath, status, amberReason, createdAt, updatedAt,
         iters: iterations.length, scores: iterations.map((it) => it.judge?.score ?? null) })) });
  });

  app.get('/api/refinery/job', async (req, res) => {
    const job = await getRefineryJob(RUNS_DIR, String(req.query.id || ''));
    if (!job) return res.status(404).json({ error: 'no such job' });
    res.json(job);
  });

  app.post('/api/refinery/stop', (req, res) => { refinery.stop(String(req.body.id || '')); res.json({ ok: true }); });

  app.post('/api/refinery/relaunch', async (req, res) => {
    try { res.json(await refinery.relaunch(String(req.body.id || ''), { userNotes: req.body.userNotes })); }
    catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/refinery/approve', async (req, res) => {
    try {
      const job = await getRefineryJob(RUNS_DIR, String(req.body.id || ''));
      if (!job) return res.status(404).json({ error: 'no such job' });
      if (job.status === 'running' || job.status === 'queued') return bad(res, 'stop the job first');
      const guideline = finalGuideline(job);
      if (!guideline) return bad(res, 'job has no scored iteration to approve');
      await writePromptRaw(root, job.promptPath, guideline);
      job.status = 'approved';
      await saveRefineryJob(RUNS_DIR, job);
      res.json({ ok: true });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/refinery/reject', async (req, res) => {
    try {
      const job = await getRefineryJob(RUNS_DIR, String(req.body.id || ''));
      if (!job) return res.status(404).json({ error: 'no such job' });
      if (job.status === 'running' || job.status === 'queued') return bad(res, 'stop the job first');
      job.status = 'idle'; job.amberReason = null;
      await saveRefineryJob(RUNS_DIR, job);
      res.json({ ok: true });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.post('/api/refinery/delete', async (req, res) => {
    try {
      const job = await getRefineryJob(RUNS_DIR, String(req.body.id || ''));
      if (!job) return res.status(404).json({ error: 'no such job' });
      if (job.status === 'running' || job.status === 'queued') return bad(res, 'stop the job first');
      await deleteRefineryJob(RUNS_DIR, job.id);   // removes the record + all frames/gifs
      res.json({ ok: true });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.get('/api/refinery/diff', async (req, res) => {
    try {
      const job = await getRefineryJob(RUNS_DIR, String(req.query.id || ''));
      if (!job) return res.status(404).json({ error: 'no such job' });
      const original = await readPrompt(root, job.promptPath);
      const final = finalGuideline(job);
      if (original === null || final === null) return bad(res, 'nothing to diff');
      // Per-iteration steps: each iteration's refine turns `guideline` into
      // `refined` (= the next iteration's guideline). Stopping iterations have
      // refined=null (produced no change). The `from`/`to` labels let the UI
      // caption each step (e.g. "Iteration 1 → 2").
      const steps = (job.iterations || [])
        .filter((it) => typeof it.refined === 'string')
        .map((it) => ({ iter: it.iter, changed: it.guideline !== it.refined,
          parts: computeDiff(it.guideline, it.refined) }));
      res.json({ changed: original !== final, parts: computeDiff(original, final), steps });
    } catch (err) { bad(res, String(err.message || err)); }
  });

  app.get('/api/refinery/events', (req, res) => {
    const id = String(req.query.id || '');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    const em = refinery.events(id);
    em.on('event', send);
    req.on('close', () => em.off('event', send));
  });

  // Rendered doc for a stored iteration section — used by Playwright capture
  // AND by the UI's live previews (same pixels for both).
  app.get('/render/:jobId/:iter/:sectionId', async (req, res) => {
    try {
      const job = await getRefineryJob(RUNS_DIR, req.params.jobId);
      if (!job) return res.status(404).send('no such job');
      const it = job.iterations.find((x) => x.iter === Number(req.params.iter));
      const sec = it?.sections.find((s) => s.id === req.params.sectionId);
      if (!sec || !sec.config) return res.status(404).send('no such render');
      res.type('html').send(buildRenderDoc({ html: sec.html, css: sec.css, config: sec.config }));
    } catch (err) { res.status(400).send(String(err.message || err)); }
  });

  return app;
}

// Self-start when run directly (repo root is the parent of validator/).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(__dirname, '..');
  const port = process.env.PORT || 4500;
  createApp(root, { port }).listen(port, () => {
    console.log(`Interact Validator on http://localhost:${port} (root: ${root})`);
  });
}
