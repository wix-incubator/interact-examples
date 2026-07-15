import { injectBase } from './preview.js';
import { mdToHtml } from './md.js';

// Version state — mutually exclusive (green / yellow / red).
const VER = {
  clean:    { cls: 'green',  label: 'Latest version', tip: 'Uses @wix/interact pinned to the latest version, with no outdated syntax.' },
  outdated: { cls: 'yellow', label: 'Old version / syntax', tip: 'Uses @wix/interact but on an old or unpinned version, or with outdated syntax.' },
  none:     { cls: 'red',    label: 'No interact', tip: 'Does not use @wix/interact at all.' },
};
function versionState(d) {
  if (!d.usesInteract) return 'none';
  if (d.isLatest && (d.oldSyntaxMarkers?.length || 0) === 0) return 'clean';
  return 'outdated';
}
function indicatorsHTML(d) {
  if (!d) return '';
  const v = VER[versionState(d)];
  let h = `<span class="ind ${v.cls}" title="${esc(v.label)}"></span>`;
  if (d.usesCustomEffect) h += `<span class="ind purple" title="Uses customEffect"></span>`;
  if (d.usesExtraJs) h += `<span class="js-badge" title="JavaScript animation not tied to a customEffect">JS</span>`;
  return h;
}

const state = {
  files: [], diag: {}, drafts: new Set(), selected: new Set(), current: null,
  filter: '', mode: 'preview', version: 'current', progress: null,
  expanded: new Set(), logs: new Map(), activity: { open: false, file: null, follow: true },
  view: 'examples', prompts: [], promptExpanded: new Set(), currentPrompt: null, promptMode: 'rendered',
  refinery: { jobsByPrompt: {}, sections: [], selected: new Set(), currentJob: null, viewIter: null, es: null, esJob: null, bodyKey: null, barKey: null },
};
const $ = (id) => document.getElementById(id);
const api = (path, opts) => fetch(path, opts).then((r) => r.json());
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function loadFiles() { state.files = (await api('/api/files')).files; renderTree(); }
async function loadPrompts() { state.prompts = (await api('/api/prompts')).files; if (state.view === 'prompts') renderTree(); }
// Drafts live on disk and survive a server/page restart; the in-memory set
// starts empty, so hydrate it on load or draft tags/tab vanish after refresh.
async function loadDrafts() { state.drafts = new Set((await api('/api/drafts')).paths); renderTree(); }
async function loadOptions() {
  const { options } = await api('/api/options');
  $('fixOptions').innerHTML = options.map((o) =>
    `<label class="opt"><input type="checkbox" class="cb" name="opt" value="${esc(o.id)}" ${o.default ? 'checked' : ''}/>
      <span>${esc(o.label)}</span></label>`).join('');
}

const matchesFilter = (list) => state.filter ? list.filter((f) => f.path.toLowerCase().includes(state.filter.toLowerCase())) : list;
const visibleFiles = () => matchesFilter(state.files);
const visiblePrompts = () => matchesFilter(state.prompts);

// ── File tree (shared by both views) ────────────────
function buildTree(files) {
  const root = { dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root, prefix = '';
    for (let i = 0; i < parts.length - 1; i++) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { name: parts[i], path: prefix, dirs: new Map(), files: [] });
      node = node.dirs.get(parts[i]);
    }
    node.files.push(f);
  }
  return root;
}
const FOLDER_ICON = '<svg class="ficon" viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3.379a1.5 1.5 0 0 1 1.06.44L9 5.5h7.5A1.5 1.5 0 0 1 18 7v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 14.5z"/></svg>';

function fileRow(f) {
  const d = state.diag[f.path];
  const draft = state.drafts.has(f.path) ? '<span class="draft-tag">draft</span>' : '';
  const checked = state.selected.has(f.path) ? 'checked' : '';
  const active = state.current === f.path ? ' active' : '';
  const title = d ? `${f.path} — ${VER[versionState(d)].label}` : f.path;
  return `<div class="file-row${active}" data-path="${esc(f.path)}" title="${esc(title)}">
    <input type="checkbox" class="cb" ${checked}/>
    <span class="fname">${esc(f.file)}</span>
    <span class="inds">${indicatorsHTML(d)}</span>${draft}</div>`;
}
function promptRow(f) {
  const active = state.currentPrompt === f.path ? ' active' : '';
  return `<div class="file-row${active}" data-ppath="${esc(f.path)}" title="${esc(f.path)}">
    <input type="checkbox" class="jcb" data-jp="${esc(f.path)}" ${state.refinery.selected.has(f.path) ? 'checked' : ''}/>
    <span class="fname">${esc(f.file)}</span>${promptDot(f.path)}<span class="md-badge">md</span></div>`;
}

function renderNodes(node, depth, forceOpen, expanded, rowFn) {
  const pad = (n) => `style="padding-left:${8 + n * 14}px"`;
  let html = '';
  for (const dir of [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const open = forceOpen || expanded.has(dir.path);
    html += `<div class="folder-row" data-folder="${esc(dir.path)}" ${pad(depth)}>
      <span class="chev">${open ? '▾' : '▸'}</span>${FOLDER_ICON}<span class="fname">${esc(dir.name)}</span></div>`;
    if (open) html += `<div class="folder-children">${renderNodes(dir, depth + 1, forceOpen, expanded, rowFn)}</div>`;
  }
  for (const f of node.files.sort((a, b) => a.file.localeCompare(b.file))) {
    html += `<div ${pad(depth)} class="file-wrap">${rowFn(f)}</div>`;
  }
  return html;
}

function renderTree() {
  const isEx = state.view === 'examples';
  const files = isEx ? visibleFiles() : visiblePrompts();
  const expanded = isEx ? state.expanded : state.promptExpanded;
  const rowFn = isEx ? fileRow : promptRow;
  const empty = !isEx && !files.length
    ? '<div style="padding:16px;color:var(--text-3);font-size:12px;line-height:1.5">No prompts yet. Select example(s) and click <b>Convert to prompt</b>.</div>' : '';
  $('fileTree').innerHTML = empty || renderNodes(buildTree(files), 0, !!state.filter, expanded, rowFn);
}

function renderSummary() {
  const ds = Object.values(state.diag);
  if (!ds.length) { $('summary').innerHTML = ''; return; }
  let green = 0, yellow = 0, red = 0, purple = 0, js = 0;
  for (const d of ds) {
    const v = versionState(d);
    if (v === 'clean') green++; else if (v === 'outdated') yellow++; else red++;
    if (d.usesCustomEffect) purple++;
    if (d.usesExtraJs) js++;
  }
  const chip = (cls, n, label, tip) =>
    `<span class="stat tip" data-tip="${esc(label)} — ${esc(tip)}"><span class="ind ${cls}"></span><b>${n}</b></span>`;
  $('summary').innerHTML =
    `<span class="stat tip" data-tip="Total animation files scanned"><b>${ds.length}</b> files</span>` +
    chip('green', green, VER.clean.label, VER.clean.tip) +
    chip('yellow', yellow, VER.outdated.label, VER.outdated.tip) +
    chip('red', red, VER.none.label, VER.none.tip) +
    chip('purple', purple, 'customEffect', 'Files that use a customEffect.') +
    `<span class="stat tip" data-tip="JavaScript animation — files with JS not tied to a customEffect"><span class="js-badge sm">JS</span><b>${js}</b></span>`;
}

async function scan() {
  $('scanBtn').disabled = true; $('scanBtn').textContent = 'Scanning…';
  try {
    const { results } = await api('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    state.diag = {};
    for (const r of results) state.diag[r.path] = r;
    renderSummary();
    renderTree();
  } finally {
    $('scanBtn').disabled = false; $('scanBtn').textContent = 'Scan';
  }
}

// ── Viewport ────────────────────────────────────────
function baseHrefFor(path) { const s = path.lastIndexOf('/'); return s === -1 ? '/' : '/' + path.slice(0, s + 1); }
const fetchSource = (kind, path) => api(`/api/${kind}?path=${encodeURIComponent(path)}`).then((r) => r.source);
const fetchPrompt = (path) => api(`/api/prompt?path=${encodeURIComponent(path)}`).then((r) => r.source);
const blankDoc = (label) => `<!doctype html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,system-ui,sans-serif;color:#b0b0b5;background:#fff;font-size:14px">${label}</body>`;

async function sourceFor(path, version) {
  if (version === 'draft') return state.drafts.has(path) ? fetchSource('draft', path) : null;
  return fetchSource('file', path);
}
async function renderDiff(path) {
  const res = await fetch(`/api/diff?path=${encodeURIComponent(path)}`);
  if (!res.ok) { $('diff').innerHTML = '<div style="color:var(--text-3)">No draft for this file yet — fix it first.</div>'; return; }
  const { parts } = await res.json();
  $('diff').innerHTML = parts.map((p) => {
    const safe = esc(p.value);
    if (p.added) return `<ins>${safe}</ins>`;
    if (p.removed) return `<del>${safe}</del>`;
    return `<span>${safe}</span>`;
  }).join('');
}

function renderTopbar() {
  const mt = $('modeTabs'), vt = $('verTabs');
  if (state.view === 'examples') {
    mt.innerHTML = ['preview', 'code', 'diff'].map((m) =>
      `<button data-mode="${m}" class="tab${state.mode === m ? ' active' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('');
    vt.style.display = '';
    for (const b of vt.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.ver === state.version);
    $('topbar').classList.toggle('diff', state.mode === 'diff');
  } else {
    // Prompt view: Prompt (rendered md) · Raw · Refinery (only when the prompt has jobs).
    const hasJobs = (state.refinery.jobsByPrompt[state.currentPrompt] || []).length > 0;
    const tabs = [['rendered', 'Prompt'], ['raw', 'Raw']];
    if (hasJobs) tabs.push(['refinery', 'Refinery']);
    const mode = effectivePromptMode();
    mt.innerHTML = tabs.map(([m, lbl]) =>
      `<button data-mode="${m}" class="tab${mode === m ? ' active' : ''}">${lbl}</button>`).join('');
    vt.style.display = 'none';
    $('topbar').classList.remove('diff');
  }
}

// The prompt-mode actually shown: 'refinery' only holds when the prompt has
// jobs, otherwise it falls back to 'rendered' (so switching to a job-less
// prompt while on the Refinery tab shows the prompt, not a blank view).
function effectivePromptMode() {
  const hasJobs = (state.refinery.jobsByPrompt[state.currentPrompt] || []).length > 0;
  if (state.promptMode === 'refinery' && !hasJobs) return 'rendered';
  return state.promptMode;
}

async function render() {
  renderTopbar();
  $('placeholder').querySelector('p').textContent = state.view === 'prompts' ? 'Select a prompt to view' : 'Select a file to preview';
  if (state.view === 'prompts') return renderPromptView();
  return renderExampleView();
}

async function renderExampleView() {
  $('loopView').hidden = true;
  $('refineSelBtn').hidden = true;
  const { mode, version, current } = state;
  $('markdown').hidden = true;
  const has = !!current;
  $('placeholder').hidden = has;
  $('preview').hidden = !(has && mode === 'preview');
  $('code').hidden = !(has && mode === 'code');
  $('diff').hidden = !(has && mode === 'diff');
  if (!has) return;
  if (mode === 'diff') { renderDiff(current); return; }
  const src = await sourceFor(current, version);
  if (mode === 'preview') $('preview').srcdoc = src === null ? blankDoc('No draft yet — fix this file first') : injectBase(src, baseHrefFor(current));
  else $('code').textContent = src === null ? 'No draft yet — fix this file first.' : src;
}

async function renderPromptView() {
  $('preview').hidden = true; $('diff').hidden = true;
  const has = !!state.currentPrompt;
  $('refineSelBtn').hidden = !(state.view === 'prompts' && state.refinery.selected.size);
  const mode = effectivePromptMode();
  const showJob = has && mode === 'refinery';
  $('placeholder').hidden = has;
  $('loopView').hidden = !showJob;
  $('markdown').hidden = !(has && mode === 'rendered');
  $('code').hidden = !(has && mode === 'raw');
  if (!has) return;
  if (showJob) {
    // Show the prompt's latest job (unless we're already viewing one of its jobs).
    const jobs = state.refinery.jobsByPrompt[state.currentPrompt] || [];
    const cur = state.refinery.currentJob;
    const keep = cur && jobs.some((j) => j.id === cur.id);
    if (!keep && jobs.length) openJobView(jobs[0].id);
    return;
  }
  // Prompt (rendered) or Raw — and make sure any live job SSE is closed.
  $('loopView').hidden = true;
  state.refinery.es?.close(); state.refinery.es = null;
  const src = await fetchPrompt(state.currentPrompt);
  if (mode === 'rendered') $('markdown').innerHTML = mdToHtml(src);
  else $('code').textContent = src;
}

// ── Live progress (SSE) ─────────────────────────────
let progTimer = null;
function renderProgress() {
  const p = state.progress;
  if (!p) { $('fixProgress').innerHTML = ''; return; }
  const elapsed = Math.round(((p.endedAt || Date.now()) - p.startedAt) / 1000);
  const head = p.running
    ? `<span class="spinner"></span><span>Working…</span><span class="count">${p.done}/${p.total} · ${elapsed}s</span>`
    : `<span class="mk mk-ok">✓</span><span>Finished</span><span class="count">${p.done}/${p.total} · ${elapsed}s</span>`;
  const items = [...p.items.entries()].map(([path, st]) => {
    const mk = st.status === 'pending' ? '<span class="spinner"></span>'
      : st.status === 'fixed' ? '<span class="mk mk-ok">✓</span>'
      : st.status === 'needsReview' ? '<span class="mk mk-warn">⚠</span>'
      : '<span class="mk mk-fail">✗</span>';
    const t = `${path}${st.error ? ' — ' + st.error : ''}`;
    const via = st.via ? `<span class="via">${esc(st.via)}</span>` : '';
    return `<div class="prog-item">${mk}<span class="nm" title="${esc(t)}">${esc(path.split('/').pop())}</span>${via}</div>`;
  }).join('');
  $('fixProgress').innerHTML = `<div class="prog-head">${head}</div><div class="prog-list">${items}</div>`;
}

function appendLog(path, text) {
  state.logs.set(path, (state.logs.get(path) || '') + text);
  if (state.activity.follow) state.activity.file = path;
  if (state.activity.open) renderActivity();
}

async function streamSSE(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /event:\s*(.+)/.exec(frame);
      const dt = /data:\s*([\s\S]+)/.exec(frame);
      if (!ev || !dt) continue;
      let d; try { d = JSON.parse(dt[1]); } catch { continue; }
      onEvent(ev[1].trim(), d);
    }
  }
}

function startRun(paths) {
  state.progress = { running: true, total: paths.length, done: 0, startedAt: Date.now(), endedAt: null,
    items: new Map(paths.map((p) => [p, { status: 'pending' }])) };
  state.logs = new Map();
  state.activity.follow = true;
  if (state.activity.open) renderActivity();
  renderProgress();
  progTimer = setInterval(renderProgress, 500);
}
function endRun() {
  state.progress.running = false;
  state.progress.endedAt = Date.now();
  clearInterval(progTimer);
  renderProgress();
  refreshAgent();
}

// ── Agent runtime chip (model + context usage) ──────
const fmtK = (n) => n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
async function refreshAgent() {
  try {
    const s = await api('/api/agent/status');
    $('modelSelect').value = s.model || '';
    $('modelSelect').options[0].textContent = s.lastModel && !s.model
      ? `CLI default (${s.lastModel.replace(/^claude-/, '')})` : 'CLI default';
    const chip = $('ctxChip');
    if (s.last) {
      const pct = Math.min(100, Math.round(100 * s.last.total / s.window));
      chip.textContent = `⌸ ${fmtK(s.last.total)} · ${pct}% ctx`;
      chip.classList.toggle('warn', pct >= 75);
      chip.title = `Last agent call: ${fmtK(s.last.input)} in + ${fmtK(s.last.output)} out of a ~${fmtK(s.window)}-token window (${pct}%).
Session totals: ${s.totals.calls} call${s.totals.calls === 1 ? '' : 's'}, ${fmtK(s.totals.input + s.totals.output)} tokens. ↺ resets them.
Model: ${s.lastModel || 'unknown'}. Every call starts a fresh context — nothing carries over between runs.`;
    } else {
      chip.textContent = 'agent idle';
      chip.classList.remove('warn');
      chip.title = 'Token usage appears after the first agent call (fix, convert, or refine).';
    }
  } catch { /* server briefly down — leave the chip as-is */ }
}
$('modelSelect').onchange = async (e) => {
  await api('/api/agent/model', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: e.target.value }) });
  refreshAgent();
};
$('ctxReset').onclick = async () => { await api('/api/agent/reset', { method: 'POST' }); refreshAgent(); };

function applyResult(r) {
  if (!state.progress) return;
  state.progress.items.set(r.path, { status: r.status, error: r.error, via: r.via });
  state.progress.done++;
  if (r.status !== 'fixFailed') state.drafts.add(r.path);
  renderProgress();
  renderTree();
}
function applyConvertResult(r) {
  if (!state.progress) return;
  const status = r.status === 'converted' ? 'fixed' : r.status === 'failed' ? 'fixFailed' : r.status;
  state.progress.items.set(r.path, { status, error: r.error, via: r.via });
  state.progress.done++;
  renderProgress();
}

async function runFix() {
  const paths = [...state.selected];
  if (!paths.length) { $('applyStatus').textContent = 'Select files first.'; return; }
  const optionIds = [...document.querySelectorAll('input[name=opt]:checked')].map((c) => c.value);
  const customPrompt = $('customPrompt').value;
  startRun(paths);
  $('fixBtn').disabled = true; $('convertBtn').disabled = true; $('applyStatus').textContent = '';
  try {
    const res = await fetch('/api/fix', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ paths, optionIds, customPrompt }) });
    if (res.body && res.headers.get('content-type')?.includes('text/event-stream')) {
      await streamSSE(res, (type, d) => { if (type === 'result') applyResult(d); else if (type === 'log') appendLog(d.path, d.text); });
    } else { (await res.json()).results?.forEach(applyResult); }
  } finally {
    endRun();
    $('fixBtn').disabled = false; $('convertBtn').disabled = false;
    renderTree();
    if (state.view === 'examples' && state.current && state.drafts.has(state.current)) state.version = 'draft';
    render();
  }
}

async function runConvert() {
  const paths = [...state.selected];
  if (!paths.length) { $('applyStatus').textContent = 'Select example files first.'; return; }
  startRun(paths);
  $('fixBtn').disabled = true; $('convertBtn').disabled = true; $('applyStatus').textContent = '';
  try {
    const res = await fetch('/api/convert', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ paths }) });
    if (res.body && res.headers.get('content-type')?.includes('text/event-stream')) {
      await streamSSE(res, (type, d) => { if (type === 'result') applyConvertResult(d); else if (type === 'log') appendLog(d.path, d.text); });
    } else { (await res.json()).results?.forEach(applyConvertResult); }
  } finally {
    endRun();
    $('fixBtn').disabled = false; $('convertBtn').disabled = false;
    await loadPrompts();
    $('applyStatus').textContent += '  Prompts updated — see the Prompts tab.';
  }
}

async function applyOrDiscard(endpoint) {
  const paths = [...state.selected].filter((p) => state.drafts.has(p));
  if (!paths.length) { $('applyStatus').textContent = 'No drafts in selection.'; return; }
  const data = await api(`/api/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paths }) });
  const results = data.results || [];
  const succeeded = results.filter((r) => r.ok).map((r) => r.path);
  const failed = results.filter((r) => !r.ok);
  for (const p of succeeded) state.drafts.delete(p);
  let msg = `${endpoint === 'apply' ? 'Applied' : 'Discarded'} ${succeeded.length} draft(s).`;
  if (failed.length) msg += ` Failed ${failed.length}: ${failed.map((r) => r.path).join(', ')}`;
  $('applyStatus').textContent = msg;
  renderTree();
  if (state.current && succeeded.includes(state.current)) state.version = 'current';
  render();
}

// ── Agent activity modal ────────────────────────────
function renderActivity() {
  const paths = [...state.logs.keys()];
  if (state.activity.file && !state.logs.has(state.activity.file)) state.activity.file = null;
  if (!state.activity.file && paths.length) state.activity.file = paths[paths.length - 1];
  $('activityFile').innerHTML = paths.length
    ? paths.map((p) => `<option value="${esc(p)}" ${p === state.activity.file ? 'selected' : ''}>${esc(p.split('/').pop())}</option>`).join('')
    : '<option>— no agent runs yet —</option>';
  const body = $('activityBody');
  if (!paths.length) {
    const running = state.progress && state.progress.running;
    body.textContent = running
      ? 'Waiting for the model to start streaming…\n\nThe claude CLI takes a few seconds to spin up before the first token. If nothing appears after that, your validator server may predate this feature — restart it (Ctrl-C, then `npm start`).'
      : 'No agent output yet. Run a fix or a convert that needs the model.\n\nMechanical fixes (version pin, tag rename) are done by the deterministic codemod and produce no reasoning.';
  } else {
    // Stick to the bottom only if the user is already there — otherwise leave
    // their scroll position alone so they can read back while it streams.
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
    body.textContent = state.logs.get(state.activity.file) || '(waiting for output…)';
    if (atBottom) body.scrollTop = body.scrollHeight;
  }
}
function openActivity() { state.activity.open = true; $('activityModal').hidden = false; renderActivity(); }
function closeActivity() { state.activity.open = false; $('activityModal').hidden = true; }

// ── Refinery: status dots + jobs poller ─────────────
// status dot for a prompt: latest job wins.
function promptDot(path) {
  const jobs = state.refinery.jobsByPrompt[path] || [];
  if (!jobs.length) return '';
  const j = jobs[0];
  const cls = { queued: 'q', running: 'run', green: 'ok', amber: 'warn', failed: 'fail', approved: 'done', idle: '' }[j.status] || '';
  const label = j.status === 'running' ? `running · iter ${j.iters}` : j.status;
  return cls ? `<span class="jdot ${cls}" title="${esc(label)}"></span>` : '';
}

async function refreshJobs() {
  try {
    const { jobs } = await api('/api/refinery/jobs');
    const by = {};
    for (const j of jobs) (by[j.promptPath] = by[j.promptPath] || []).push(j);
    state.refinery.jobsByPrompt = by;
    renderQueueWidget(jobs);
    if (state.view === 'prompts') renderTree();
    // live-follow the open job
    const cur = state.refinery.currentJob;
    if (cur && !$('loopView').hidden) {
      const fresh = jobs.find((j) => j.id === cur.id);
      if (fresh && (fresh.status !== cur.status || fresh.iters !== cur.iters)) openJobView(cur.id, { keepIter: true });
    }
  } catch { /* server briefly down */ }
}
setInterval(refreshJobs, 4000);
refreshJobs();

// ── Launch sheet ────────────────────────────────────
async function openLaunch() {
  const { sections } = await api('/api/playground/sections');
  state.refinery.sections = [];
  $('launchPrompts').innerHTML = [...state.refinery.selected].map((p) => `<div class="launch-row">${esc(p)}</div>`).join('');
  $('launchSections').innerHTML = sections.map((s) =>
    `<span class="chip" data-ls="${esc(s.id)}">${esc(s.id)}</span>`).join('');
  $('launchErr').textContent = '';
  $('launchModal').hidden = false;
}
$('refineSelBtn').onclick = openLaunch;
$('launchClose').onclick = () => { $('launchModal').hidden = true; };
$('launchSections').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  const id = chip.dataset.ls;
  const i = state.refinery.sections.indexOf(id);
  if (i >= 0) state.refinery.sections.splice(i, 1);
  else if (state.refinery.sections.length < 4) state.refinery.sections.push(id);
  chip.classList.toggle('on', state.refinery.sections.includes(id));
});
$('launchGo').onclick = async () => {
  if (!state.refinery.sections.length) { $('launchErr').textContent = 'Pick at least one section.'; return; }
  const res = await api('/api/refinery/launch', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ promptPaths: [...state.refinery.selected], sections: state.refinery.sections }) });
  if (res.error) { $('launchErr').textContent = res.error; return; }
  if (res.errors?.length) $('launchErr').textContent = res.errors.map((e) => `${e.promptPath}: ${e.error}`).join(' · ');
  else $('launchModal').hidden = true;
  state.refinery.selected.clear();
  $('refineSelBtn').hidden = true;
  refreshJobs();
};

// ── Queue widget ────────────────────────────────────
function renderQueueWidget(jobs) {
  const act = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  $('queueWidget').innerHTML = !act.length ? '' :
    '<div class="qw-head">Refinery queue</div>' + act.map((j) =>
      `<div class="qw-row" data-job="${j.id}" data-jp="${esc(j.promptPath)}">
        ${j.status === 'running' ? '<span class="spinner"></span>' : '<span class="jdot q"></span>'}
        <span class="qw-name">${esc(j.promptPath.split('/').pop())}</span>
        <span class="qw-st">${j.status === 'running' ? `iter ${Math.max(1, j.iters)}` : 'queued'}</span></div>`).join('');
}
$('queueWidget').addEventListener('click', (e) => {
  const row = e.target.closest('.qw-row'); if (!row) return;
  state.currentPrompt = row.dataset.jp;
  renderTree(); render();
  openJobView(row.dataset.job);
});

// ── Job view — renders entirely from a fresh GET /api/refinery/job ──
const STATUS_BADGE = {
  queued:   ['Queued', ''], running: ['Running', ''], green: ['Green — review & approve', 'ok'],
  amber:    ['Amber — needs attention', 'history'], failed: ['Failed', 'history'],
  approved: ['Approved ✓', 'ok'], idle: ['Idle', ''],
};

async function openJobView(jobId, { keepIter } = {}) {
  const job = await api(`/api/refinery/job?id=${encodeURIComponent(jobId)}`);
  if (job.error) return;
  const switching = !state.refinery.currentJob || state.refinery.currentJob.id !== job.id;
  state.refinery.currentJob = job;
  if (!keepIter) state.refinery.viewIter = null;
  if (switching) { state.refinery.bodyKey = null; state.refinery.barKey = null; }   // force body+bar rebuild when changing jobs
  $('markdown').hidden = true; $('code').hidden = true; $('preview').hidden = true; $('diff').hidden = true;
  $('placeholder').hidden = true; $('loopView').hidden = false;
  renderJobView(job);
  subscribeJob(job);
}

function renderJobView(job) {
  const [label, cls] = STATUS_BADGE[job.status] || [job.status, ''];
  const scores = job.iterations.map((it) => it.judge?.score ?? '×');
  const viewIter = state.refinery.viewIter ?? job.iterations.length;
  // header: badge, score trail, iteration chips, actions
  $('jobHead').innerHTML = `
    <span class="round-badge ${cls}">${esc(label)}${job.amberReason ? ` · ${esc(job.amberReason)}` : ''}</span>
    <span class="loop-sub">${esc(job.promptPath)} · iter ${job.iterations.length}/${job.stop.maxIters}
      ${scores.length ? '· scores ' + scores.join(' → ') : ''}</span>
    <span class="iter-chips">${job.iterations.map((it) =>
      `<button class="iter-chip ${it.iter === viewIter ? 'on' : ''}" data-iter="${it.iter}">${it.iter}</button>`).join('')}</span>
    <span id="loopStatus" class="loop-status"></span>
    ${job.status === 'running' ? '<button id="jobStopBtn" class="btn btn-ghost btn-mini">Stop after iteration</button>' : ''}
    <button id="jobActivityBtn" class="btn btn-ghost btn-mini">◧ Activity</button>`;
  // body: the viewed iteration. Rebuild ONLY when its content actually changes
  // — reassigning innerHTML recreates the <iframe>s, which reload and flash. A
  // content key (job/iter + each section's config/error + judge verdict) lets
  // the 4s poll and SSE refreshes leave unchanged previews untouched.
  const it = job.iterations.find((x) => x.iter === viewIter);
  const bodyKey = !it
    ? `empty:${job.id}:${job.status}`
    : JSON.stringify({ j: job.id, i: it.iter,
        s: it.sections.map((x) => [x.id, !!x.config, x.error || '']),
        v: it.judge?.error ? `e:${it.judge.error}` : it.judge ? `${it.judge.score}:${it.judge.notes}:${JSON.stringify(it.judge.sections || [])}` : '' });
  if (bodyKey !== state.refinery.bodyKey) {
    state.refinery.bodyKey = bodyKey;
    if (!it) {
      $('jobBody').innerHTML = `<div class="loop-empty">${job.status === 'queued' ? 'Waiting in the queue…' : 'No iterations yet — generating…'}</div>`;
    } else {
      const judgeBlock = it.judge?.error ? `<div class="err">judge failed: ${esc(it.judge.error)}</div>`
        : it.judge ? `<div class="judge-note"><b>${it.judge.score}/10</b> — ${esc(it.judge.notes)}</div>` : '';
      $('jobBody').innerHTML = judgeBlock + it.sections.map((s) => {
        const issues = (it.judge?.sections || []).find((x) => x.id === s.id)?.issues || [];
        const inner = s.error ? `<div class="err">${esc(s.error)}</div>`
          : `<iframe sandbox="allow-scripts" src="/render/${job.id}/${it.iter}/${encodeURIComponent(s.id)}"></iframe>`;
        return `<div class="loop-cell"><div class="cap"><span class="cap-id">${esc(s.id)}</span>
          ${s.error ? '' : `<button class="cap-expand" data-xj="${job.id}" data-xi="${it.iter}" data-xs="${esc(s.id)}" title="Expand">⛶</button>`}</div>
          ${inner}${issues.length ? `<div class="cell-issues">${issues.map((i) => `· ${esc(i)}`).join('<br>')}</div>` : ''}</div>`;
      }).join('');
    }
  }
  // bottom bar: approve flow / relaunch with notes / delete. Rebuild only when
  // its shape changes (status + iteration count) — otherwise a 4s poll would
  // recreate the textarea and wipe notes the user is mid-way through typing.
  const done = ['green', 'amber', 'failed', 'idle'].includes(job.status);
  $('jobBar').hidden = !done;
  const barKey = `${job.status}:${job.iterations.length}`;
  if (done && barKey !== state.refinery.barKey) {
    state.refinery.barKey = barKey;
    $('jobBar').innerHTML = `
      <textarea id="jobNotes" placeholder="Optional guidance for the next run (rides into the refine step)"></textarea>
      <div class="loop-actions">
        ${job.status !== 'failed' && job.iterations.length ? '<button id="jobApprove" class="btn btn-primary">Approve (write .md)</button>' : ''}
        <button id="jobRelaunch" class="btn">Relaunch</button>
        ${job.iterations.length ? '<button id="jobDiffBtn" class="btn btn-ghost btn-mini">Δ Prompt diff</button>' : ''}
        ${job.status !== 'idle' && job.status !== 'failed' ? '<button id="jobReject" class="btn btn-ghost btn-mini">Reject (keep history)</button>' : ''}
        <button id="jobDelete" class="btn btn-ghost btn-mini">Delete job</button>
      </div>`;
  } else if (!done) {
    state.refinery.barKey = null;
  }
}

// Live previews use src=/render/... (session-cookie-free, CORS-safe: same origin,
// sandboxed like the old grid). Expanded view reuses the same URL.
$('jobBody').addEventListener('click', (e) => {
  const x = e.target.closest('[data-xj]'); if (!x) return;
  $('expandTitle').textContent = `${x.dataset.xs} · iteration ${x.dataset.xi}`;
  $('expandFrame').removeAttribute('srcdoc');
  $('expandFrame').src = `/render/${x.dataset.xj}/${x.dataset.xi}/${encodeURIComponent(x.dataset.xs)}`;
  $('expandModal').hidden = false;
});

$('jobHead').addEventListener('click', async (e) => {
  const chip = e.target.closest('.iter-chip');
  if (chip) { state.refinery.viewIter = Number(chip.dataset.iter); renderJobView(state.refinery.currentJob); return; }
  if (e.target.id === 'jobStopBtn') {
    await api('/api/refinery/stop', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: state.refinery.currentJob.id }) });
    document.getElementById('loopStatus').textContent = 'Will stop after the current iteration.';
  }
  if (e.target.id === 'jobActivityBtn') openActivity();
});

$('jobBar').addEventListener('click', async (e) => {
  const job = state.refinery.currentJob; if (!job) return;
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (e.target.id === 'jobApprove') {
    const r = await post('/api/refinery/approve', { id: job.id });
    document.getElementById('loopStatus').textContent = r.error || 'Approved — guideline written to the .md.';
    refreshJobs(); openJobView(job.id);
  } else if (e.target.id === 'jobRelaunch') {
    const notes = document.getElementById('jobNotes')?.value || '';
    const r = await post('/api/refinery/relaunch', { id: job.id, userNotes: notes || undefined });
    document.getElementById('loopStatus').textContent = r.error || 'Relaunched.';
    refreshJobs(); openJobView(job.id);
  } else if (e.target.id === 'jobReject') {
    const r = await post('/api/refinery/reject', { id: job.id });
    document.getElementById('loopStatus').textContent = r.error || 'Rejected — history kept.';
    refreshJobs(); openJobView(job.id);
  } else if (e.target.id === 'jobDiffBtn') {
    const d = await api(`/api/refinery/diff?id=${encodeURIComponent(job.id)}`);
    $('diffTitle').textContent = `Prompt evolution — original .md → final`;
    const renderParts = (parts) => parts.map((p) =>
      p.added ? `<ins>${esc(p.value)}</ins>` : p.removed ? `<del>${esc(p.value)}</del>` : `<span>${esc(p.value)}</span>`).join('');
    if (d.error) {
      $('diffBody').innerHTML = `<span>${esc(d.error)}</span>`;
    } else {
      const section = (heading, changed, parts) =>
        `<div class="diff-section"><div class="diff-head">${esc(heading)}</div>${
          changed ? renderParts(parts) : '<div class="diff-none">no change</div>'}</div>`;
      // Overall first, then each iteration's refine (iteration N → N+1).
      let html = section('Overall · original .md → best guideline', d.changed, d.parts);
      const steps = d.steps || [];
      if (steps.length) {
        html += '<div class="diff-sub">Per-iteration changes</div>';
        html += steps.map((s) => section(`Iteration ${s.iter} → ${s.iter + 1}`, s.changed, s.parts)).join('');
      }
      $('diffBody').innerHTML = html;
    }
    $('diffModal').hidden = false;
  } else if (e.target.id === 'jobDelete') {
    const btn = e.target;
    // Destructive: first click arms, second confirms.
    if (!btn.classList.contains('armed')) {
      btn.classList.add('armed'); btn.textContent = 'Delete — sure?';
      document.getElementById('loopStatus').textContent = 'Deletes this run and its history — click again to confirm.';
      return;
    }
    const r = await post('/api/refinery/delete', { id: job.id });
    if (r.error) { document.getElementById('loopStatus').textContent = r.error; return; }
    // Fresh start: forget the job, drop back to the prompt's markdown.
    state.refinery.currentJob = null; state.refinery.bodyKey = null; state.refinery.barKey = null;
    state.promptMode = 'rendered';
    $('loopView').hidden = true;
    await refreshJobs();
    render();
  }
});

// SSE: stream logs into the activity modal; refresh the view on step/status.
function subscribeJob(job) {
  const live = job.status === 'running' || job.status === 'queued';
  // Already streaming this job? leave the connection alone (re-opening on every
  // poll would drop in-flight log/step events).
  if (live && state.refinery.esJob === job.id && state.refinery.es) return;
  state.refinery.es?.close();
  if (!live) { state.refinery.es = null; state.refinery.esJob = null; return; }
  const es = new EventSource(`/api/refinery/events?id=${encodeURIComponent(job.id)}`);
  state.refinery.es = es; state.refinery.esJob = job.id;
  es.addEventListener('log', (e) => { const d = JSON.parse(e.data); appendLog(job.promptPath, d.text); });
  es.addEventListener('step', (e) => { const d = JSON.parse(e.data);
    const el = document.getElementById('loopStatus'); if (el) el.textContent = `iter ${d.iter} · ${d.step}…`; });
  es.addEventListener('iteration', () => openJobView(job.id, { keepIter: false }));
  es.addEventListener('status', () => { refreshJobs(); openJobView(job.id, { keepIter: true }); });
  es.addEventListener('end', () => { es.close(); state.refinery.es = null; state.refinery.esJob = null; });
}

// ── events ──────────────────────────────────────────
$('fileTree').addEventListener('click', (e) => {
  const folder = e.target.closest('.folder-row');
  if (folder) {
    const set = state.view === 'examples' ? state.expanded : state.promptExpanded;
    const p = folder.dataset.folder;
    if (set.has(p)) set.delete(p); else set.add(p);
    renderTree();
    return;
  }
  const row = e.target.closest('.file-row');
  if (!row) return;
  if (state.view === 'examples') {
    const path = row.dataset.path;
    if (e.target.classList.contains('cb')) {
      if (state.selected.has(path)) state.selected.delete(path); else state.selected.add(path);
      return;
    }
    state.current = path; renderTree(); render();
  } else {
    if (e.target.classList.contains('jcb')) {
      const p = e.target.dataset.jp;
      if (state.refinery.selected.has(p)) state.refinery.selected.delete(p); else state.refinery.selected.add(p);
      $('refineCount').textContent = state.refinery.selected.size;
      $('refineSelBtn').hidden = state.view !== 'prompts' || !state.refinery.selected.size;
      return;
    }
    state.currentPrompt = row.dataset.ppath;
    // Default to the Refinery tab when the prompt has jobs (else the prompt md).
    const hasJobs = (state.refinery.jobsByPrompt[state.currentPrompt] || []).length > 0;
    state.promptMode = hasJobs ? 'refinery' : (state.promptMode === 'refinery' ? 'rendered' : state.promptMode);
    renderTree(); render();
  }
});
$('filter').addEventListener('input', (e) => { state.filter = e.target.value.trim(); renderTree(); });
$('scanBtn').onclick = scan;
$('selectAllBtn').onclick = () => {
  const vis = visibleFiles();
  const all = vis.length && vis.every((f) => state.selected.has(f.path));
  if (all) vis.forEach((f) => state.selected.delete(f.path)); else vis.forEach((f) => state.selected.add(f.path));
  renderTree();
};
$('fixBtn').onclick = runFix;
$('convertBtn').onclick = runConvert;
$('applyBtn').onclick = () => applyOrDiscard('apply');
$('discardBtn').onclick = () => applyOrDiscard('discard');
$('modeTabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  if (state.view === 'examples') state.mode = b.dataset.mode; else state.promptMode = b.dataset.mode;
  render();
});
$('verTabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  state.version = b.dataset.ver; render();
});
for (const b of document.querySelectorAll('#viewTabs .vt')) b.onclick = () => {
  state.view = b.dataset.view;
  for (const x of document.querySelectorAll('#viewTabs .vt')) x.classList.toggle('active', x === b);
  if (state.view === 'prompts') loadPrompts();
  renderTree();
  render();
};
// Up/Down arrows navigate the visible tree rows (skips collapsed folders).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const rows = [...document.querySelectorAll('#fileTree .file-row')];
  if (!rows.length) return;
  e.preventDefault();
  const attr = state.view === 'examples' ? 'path' : 'ppath';
  const cur = state.view === 'examples' ? state.current : state.currentPrompt;
  let idx = rows.findIndex((r) => r.dataset[attr] === cur);
  if (idx < 0) idx = 0;
  else if (e.key === 'ArrowDown') idx = Math.min(idx + 1, rows.length - 1);
  else idx = Math.max(idx - 1, 0);
  const p = rows[idx].dataset[attr];
  if (state.view === 'examples') state.current = p;
  else {
    state.currentPrompt = p;
    const hasJobs = (state.refinery.jobsByPrompt[p] || []).length > 0;
    state.promptMode = hasJobs ? 'refinery' : (state.promptMode === 'refinery' ? 'rendered' : state.promptMode);
  }
  renderTree();
  render();
  requestAnimationFrame(() => {
    [...document.querySelectorAll('#fileTree .file-row')]
      .find((r) => r.dataset[attr] === p)?.scrollIntoView({ block: 'nearest' });
  });
});

$('toggleLeft').onclick = () => $('listPane').classList.toggle('collapsed');
$('toggleRight').onclick = () => $('fixPane').classList.toggle('collapsed');
$('activityBtn').onclick = openActivity;
$('activityClose').onclick = closeActivity;
$('activityModal').addEventListener('click', (e) => { if (e.target.id === 'activityModal') closeActivity(); });
$('activityFile').onchange = (e) => { state.activity.file = e.target.value; state.activity.follow = false; renderActivity(); };

// Expand (full-screen preview) modal
function closeExpand() { $('expandModal').hidden = true; $('expandFrame').srcdoc = ''; }
$('expandClose').onclick = closeExpand;
$('expandModal').addEventListener('click', (e) => { if (e.target.id === 'expandModal') closeExpand(); });

// Prompt-diff modal
$('diffClose').onclick = () => { $('diffModal').hidden = true; };
$('diffModal').addEventListener('click', (e) => { if (e.target.id === 'diffModal') $('diffModal').hidden = true; });

// Esc closes whichever modal is open (expand, diff, activity — in that order).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('expandModal').hidden) return closeExpand();
  if (!$('diffModal').hidden) { $('diffModal').hidden = true; return; }
  if (!$('activityModal').hidden) closeActivity();
});

loadFiles();
loadDrafts();
loadOptions();
refreshAgent();
setInterval(refreshAgent, 30000);   // keep the model/context chip fresh (cheap, local)
loadPrompts();
renderTopbar();
