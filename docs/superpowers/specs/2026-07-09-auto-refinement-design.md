# Autonomous Prompt Refinement (Refinery) — Design Spec

**Date:** 2026-07-09
**Status:** Approved (brainstorm), pending implementation plan
**Author:** Hassan Kettany + Claude Code
**Depends on:** the Interact Validator (`validator/`), the manual prompt-refinement loop
(loop endpoints, `render-frame.js`, vendored renderer), `lib/agent.js`/`agent-state.js`,
and the interact-xp playground (read-only, dev server on :5173).

## Problem

The manual refinement loop works but requires a human in every round: pick sections,
generate, eyeball the results, score, write notes, refine, repeat. Refining many prompts
this way doesn't scale. Additionally, the loop UI's state is ephemeral client state —
selecting another prompt in the tree destroys the generated previews (a reported bug) —
and the view doesn't communicate what iteration you're on or where each prompt stands.

## Goal

Select prompts + the sections to test them on → the system autonomously iterates
(generate → render → capture → judge → refine) per prompt until the guideline is good,
running up to two prompts in parallel with fully isolated model contexts → each finished
prompt shows **green**; the user reviews live rendered previews and approves to overwrite
the `.md` (or rejects). All job state is server-side and persistent; the UI is only a
window onto it.

## Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Judge rubric | **Pattern fidelity + integrity**: (1) generated animation expresses the same motion pattern as the original (direction, stagger, easing feel, scroll-range pacing) adapted to the section's own elements; (2) layout intact — nothing clipped/missing/overlapping, correct elements animated. Content differences never penalized. Rubric seeded with observed failure modes: premature scroll ranges, missing images, wrong elements chosen, broken layout, missing sticky behavior. |
| Stop rule | Green when judge score **≥ 8/10**; hard cap **5 iterations**; **plateau** (two consecutive iterations without a new best score) → stop **amber**. Cap reached → green if ≥8 else amber. |
| UI model | **One unified Refinery** replaces the manual loop view. Every refinement is a server-side persistent job. Manual steering = stop after current iteration, add human notes, relaunch. |
| Parallelism | **2 jobs concurrently**; the rest queue. Isolation is by construction: every model call is a fresh one-shot `claude -p` subprocess. |
| Approve flow | Green/amber job opens a review: **live rendered previews** (real animation in iframes — NOT gifs), score trail, judge reasoning, prompt diff (original `.md` → final). **Approve** writes the final guideline to the `.md`. **Reject** returns the job to idle with all history kept. |
| Engine architecture | **Approach A — Node-orchestrated pipeline**: the validator server owns the loop as deterministic code; each step (generate / capture / judge / refine) is a separate injectable unit; cross-iteration memory is an explicit curated history block, never a shared session. |

## Architecture

```
UI (Refinery)                        Validator server
  prompt tree: status dots +          ├─ lib/refinery.js   job runner: queue(2), iteration loop, stop rule
  multi-select → launch sheet         ├─ lib/jobs-store.js runs/<jobId>/job.json + runs/index.json (persisted per iteration)
  job view: score trail, iteration    ├─ lib/capture.js    Playwright scroll-sweep → PNG frames + GIF (gifenc)
  timeline, live previews,            ├─ lib/judge.js      claude -p --allowedTools Read --add-dir → {score, notes, sections[]}
  approve/reject                      ├─ lib/refine.js     + optional history block (existing module, extended)
  right panel: queue widget           ├─ serves /runs (job artifacts), /repo (read-only repo statics),
  SSE per job                         │  GET /render/... (server-side buildRenderDoc for Playwright)
                                      └─ job endpoints (launch, list, get, stop, relaunch, approve, reject) + SSE
```

### Job model (`lib/jobs-store.js`)

- **Storage:** `validator/runs/` (gitignored, served over HTTP). Per job:
  `runs/<jobId>/job.json`, `runs/<jobId>/original/frame-*.png|anim.gif`,
  `runs/<jobId>/iter-<k>/<sectionId>/frame-*.png|anim.gif`.
  `runs/index.json` maps `promptPath → [jobId...]` (latest last).
- **Job record:**
  ```
  { id, promptPath, examplePath, sections: [ids], status, createdAt, updatedAt,
    stop: { threshold: 8, maxIters: 5, plateau: 2 },
    userNotes: string|null,              // injected into the next refine on relaunch
    iterations: [{
      iter, guideline,                   // the guideline this iteration RAN with
      sections: [{ id, config?, html, css, frames: [paths], gif: path, error? }],
      judge: { score, notes, sections: [{ id, issues: [] }] } | { error },
      refined: string|null               // guideline produced (null on the final iteration)
    }] }
  ```
- **Statuses:** `queued → running → green | amber | failed`; then `approved` (terminal) or
  back to `idle` on reject. `amber` reasons recorded: `plateau`, `cap`, `interrupted`, `judge-error`,
  `capture-error`, `generate-error`.
- **Persistence discipline:** the record is written after every completed step of every
  iteration. Execution does NOT survive a server restart (everything runs in the local
  server process) — but the record does: on boot, jobs stuck in `running` become
  `amber (interrupted)`; **Relaunch** resumes from the last completed iteration using its
  `refined` guideline. Closing the browser tab does not affect jobs (they run server-side).
- The original example for a prompt is recovered by reverse mapping: `Foo.md → Foo.html`
  (inverse of `promptRelPath`). If the example file is missing → job `failed` at launch.
- The manual loop's `.history.json` files remain readable legacy; new work goes through jobs.

### Engine (`lib/refinery.js`)

In-memory queue, concurrency 2. One iteration:

1. **Generate** — existing `generate()` per section (bounded parallel, per-section isolation).
2. **Capture** — original example captured once per job (cached); each generated result
   rendered at `GET /render/<jobId>/<iter>/<sectionId>` (server-side `buildRenderDoc` from the
   stored config/html/css) and captured via `capture.js`.
3. **Judge** — one fresh vision call (below) → `{score, notes, sections}`.
4. **Decide** — pure function `decide({iterations, stop})` →
   `green | amber(reason) | continue`.
5. **Refine** — `refineGuideline` with the judge's notes + a compact history block of all
   prior iterations (`iter N → score: one-line note`), plus `userNotes` when present
   (cleared after use). The refined guideline seeds the next iteration.

Every model call is a fresh `claude -p` one-shot; parallel jobs cannot pollute each other.
All units injectable (`generateImpl`, `captureImpl`, `judgeImpl`, `refineImpl`) for tests.

### Capture (`lib/capture.js`)

- New devDep: `playwright` (chromium already cached on this machine).
- `captureSweep(url, { frames = 8, viewport = {1280, 800}, settleMs = 150 })` →
  scrolls from top to bottom in even steps, PNG per stop; assembles a ~2fps GIF via
  `gifenc`. Returns `{ frames: [paths], gif: path }`.
- Original examples served read-only at `/repo/<path>` (new static mount of the repo root).
- **v1 limitation:** scroll sweeps exercise `viewProgress`/`viewEnter` (the vast majority of
  examples). Hover/click-triggered states are not simulated; the judge is told the trigger
  type so it does not penalize what frames cannot show.

### Judge (`lib/judge.js`)

- **Invocation:** the local `claude` CLI with image access:
  `claude -p --output-format stream-json --include-partial-messages --verbose
  --allowedTools Read --add-dir <runs/jobId> --system-prompt-file <rubric>` (a variant of
  `runAgent` that permits the Read tool instead of stripping all tools). The prompt lists
  the frame file paths; the model reads the PNGs itself.
- **Inputs:** original frames, per-section frames, the original example's source code, the
  guideline, the generated configs, section trigger types, and any per-section generate errors.
- **Rubric (system prompt):** pattern fidelity + integrity per the decisions table; explicit
  instruction that content differences are expected and not penalized; scores calibrated
  1–10 with 8 = "ship it".
- **Output contract:** strict JSON `{ score: 1-10, notes: string, sections: [{ id, issues: [string] }] }`,
  fence-stripped and parsed; on parse failure, one retry with the parse error appended; then amber.
- **Model:** honors the topbar model override via `agent-state.js`, like every agent call.

### Refine memory (`lib/refine.js`, extended)

`buildRefinePrompt`/`refineGuideline` gain an optional `history` param —
`[{iter, score, note}]` rendered as a compact block — and an optional `userNotes` string.
System prompt addition: address the current feedback **without regressing what earlier
iterations fixed**. Backward compatible (manual-era callers unaffected).

### Endpoints (`server.js`)

| Endpoint | Purpose |
|---|---|
| `POST /api/refinery/launch` `{promptPaths[], sections[]}` | create one job per prompt, enqueue; `{jobs:[{id,promptPath,status}]}` |
| `GET /api/refinery/jobs?promptPath=` | jobs for a prompt (or all when omitted) |
| `GET /api/refinery/job?id=` | full job record |
| `POST /api/refinery/stop` `{id}` | stop after the current iteration → amber |
| `POST /api/refinery/relaunch` `{id, userNotes?}` | resume an amber/idle job from its last iteration |
| `POST /api/refinery/approve` `{id}` | write the final guideline to the `.md`; status → approved |
| `POST /api/refinery/reject` `{id}` | status → idle; history kept |
| `GET /api/refinery/events?id=` | SSE: step/progress/log events for a job (`Accept: text/event-stream`) |
| `GET /render/:jobId/:iter/:sectionId` | server-side render doc (for Playwright and the UI's live previews) |
| Static | `/runs` (artifacts), `/repo` (read-only repo mount) |

Path safety: prompt paths validated via the existing `prompts.js` guards; job ids are
server-generated slugs; `/render` params validated against the job record.

### UI (Refinery)

The manual loop view is **retired**; its live preview grid, expand-to-fullscreen, diff
modal, and agent-activity modal are reused. Organizing principle: **the UI is a stateless
window onto `job.json`** — switching prompts and returning re-reads the job; nothing can be
wiped by navigation (fixes the reported bug at the root).

- **Left panel (Prompts tab):** per-prompt **status dot** (grey idle / stacked-grey queued /
  blue pulsing running / green / amber / ✓ approved); checkboxes for multi-select;
  **"Refine selected (N)"** opens a launch sheet: section chips (one set for the whole
  batch), stop rule shown (≥8, max 5), Start.
- **Right panel:** **queue widget** — running jobs with live step ("iter 2/5 · capturing…"),
  then queued; click → jump to that job.
- **Main viewport (job view for the selected prompt):**
  - Header: status badge, "iter k/5", **score trail** (5 → 6 → 8).
  - **Iteration timeline**: numbered chips; click any iteration to inspect it — live
    rendered previews (real animation via the stored config/html/css), judge score +
    notes, per-section issues. Latest shown by default.
  - Running: step strip (generating i/n → capturing → judging → refining); agent-activity
    modal streams judge/refiner reasoning (job-scoped log keys).
  - Green/amber: **approve bar** — `Approve (write .md)` / `Reject` / `Δ Prompt diff`
    (original → final). Frames/GIFs remain available per iteration, but the approve
    decision surface is the live previews.
  - Steering: running job → "Stop after this iteration"; then add notes → Relaunch
    (notes ride into the next refine).

### Error handling

- Playground down at launch → job `failed` with a clear message (checked via `pingStatus`).
- Missing original example file → job `failed` at launch.
- Per-section generate failure → iteration proceeds when ≥1 section succeeded; the judge is
  told and integrity scoring reflects it. All sections failed → amber (`generate-error`).
- Capture failure → one retry → amber (`capture-error`).
- Judge unparseable JSON → one retry with the parse error appended → amber (`judge-error`).
- Server restart → `running` jobs become amber (`interrupted`); Relaunch resumes from the
  last completed iteration.

### Testing

- **Pure units:** `decide()` stop rule (threshold/plateau/cap/edge cases), history-block
  builder, judge prompt builder + JSON parsing (fenced/dirty/invalid), capture scroll-position
  math, jobs-store transitions + persistence round-trip, reverse prompt→example mapping.
- **Integration:** a full multi-iteration job with `generateImpl`/`captureImpl`/`judgeImpl`/
  `refineImpl` all faked — asserts green path, plateau→amber, cap→amber, per-section failure
  path, relaunch-from-interrupted; endpoint tests for launch/approve/reject/path-safety.
- **Playwright smoke:** one real capture of a small static page (skipped when browsers are
  unavailable).
- **Manual live smoke:** one real job against the running playground.

## Out of scope (v1)

- Hover/click trigger simulation during capture.
- Distributed / background execution beyond the local server process.
- Auto-launching the playground; editing sections from the validator.
- Judge model ensembles or multi-judge voting.
- Migrating legacy `.history.json` manual rounds into job records.

## HARD CONSTRAINT — interact-xp remains read-only

Unchanged from the previous spec: never write/build/install/checkout under
`PLAYGROUND_REPO`; only read files, import built `dist`, and HTTP the dev server.
