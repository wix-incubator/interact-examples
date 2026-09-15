# Prompt Refinement Loop — Design Spec

**Date:** 2026-07-06
**Status:** Approved (brainstorm), pending implementation plan
**Author:** Hassan Kettany + Claude Code
**Depends on:** the existing Interact Validator (`validator/`) and the convert-to-prompt feature (`Ani-Mate Prompts/`).

## Problem

The validator can now turn an animation example into a reusable prose **guideline**
(`Ani-Mate Prompts/<path>.md`, produced by the convert-interact-demo-example skill).
But a guideline is only good if it **generalizes** — it must produce quality results when
applied to many different real sections, not just the demo it came from. There is no way to
test a guideline against real sections and iteratively improve it.

## Goal

Close the loop: **select a prompt → run it in the interact-xp playground against several
sections → review the rendered results → score + note them → an agent refines the *general*
guideline (not overfit to any one output) → run again → repeat until satisfied → finalize.**

The feedback is holistic and pattern-level (it must not overfit to a single generated result),
because the prompt is meant to work across many sections.

## Investigation findings (interact-xp `playground` branch)

Verified read-only against `~/Documents/Dev/Wix/interact-xp`:

- The playground runs on the **Vite dev server at `localhost:5173`**; `POST /api/generate`
  is dev-server-only middleware (`apps/playground/vite-plugin-local-agent.ts`) that shells out
  to the local `claude` CLI (reuses `claude login`, no API key).
- **Request body (fresh):** `{ user_input, system_rules, provider?, model?, effort? }`.
  These two strings are assembled client-side by `buildGenerate()` from
  `@wix/interact-experience-prompt` (built `dist` exists), called with
  `{ html, css, userPrompt, userPromptExample, schema: EXPERIENCE_SCHEMA }`.
  - A reusable **guideline** maps to `userPromptExample`; the actual instruction is `userPrompt`.
  - The **target section** is supplied as the `html`/`css` fields — there is no separate target id.
    Applying one guideline to different sections = re-issuing the call with different section markup.
- **Response:** `{ config, sessionId }` where `config` is a JSON string of an
  `@wix/interact-experience` **Experience** (NOT HTML).
- **Config → pixels:** rendered only client-side via `createExperience` from
  `@wix/interact-experience-renderer`, which injects `<style>` and wires `@wix/interact` onto a
  root containing the section markup. **That renderer is unpublished (esm.sh 404) and has no built
  `dist`** — it runs only because Vite compiles its TS source at dev time. There is no HTML export
  and no headless render path in the repo.
- **Sections** live at `apps/playground/src/sections/<id>/{section.html, section.css,
  section.sanitized.html?}`. Available today: `4-cards`, `gallery-arc`, `grid-cards`,
  `grid-cards 2`, `image-and-text`, `image-and-text 2`, `portfolio`, `spread-out-gallery`.
- `EXPERIENCE_SCHEMA` is emitted from the Zod model via `experienceToJSONSchema` in
  `packages/interact-experience/src/schema/json-schema-emit` (TS source).

## Design decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Integration | Call the playground's `/api/generate` directly (headless); do NOT automate its UI |
| Rendering | **Bundle** `@wix/interact-experience-renderer` from interact-xp source into a `render-runtime.js` the validator serves; our iframes apply the config with `createExperience` |
| Per round | Run the guideline against **2–4 user-picked sections**, render side by side |
| Feedback | One **holistic score (1–10) + notes** per round |
| Refinement | An agent rewrites the **general** guideline from the feedback — explicitly instructed not to overfit to any single output |
| History | **Full round history** beside the prompt (versions, per-section configs, score, notes); score trend + rollback |
| Finalize | "Close the loop" writes the working guideline back to the prompt's `.md`; history file remains |
| interact-xp repo | **Read-only** — bundle from its source, never write to it |

## HARD CONSTRAINT — interact-xp is read-only

The interact-xp playground repo is **not ours**. Every task, script, and implementer MUST treat it
as strictly read-only:

- **Never** create, edit, delete, move, or overwrite any path under `PLAYGROUND_REPO`.
- **Never** run a command with `PLAYGROUND_REPO` (or any subdir) as the working directory, and never
  run build/install/format/checkout/generate commands against it (`npm`/`pnpm build|install`, `git`
  writes, codegen, etc.) — not even to produce its `dist`.
- Allowed interactions are ONLY: (a) reading files, (b) importing its **already-built** `dist`
  modules, (c) esbuild reading its source while writing output **into `validator/`**, and (d) HTTP
  requests to the dev server the user runs. All generated artifacts (bundled renderer, vendored
  schema) are written under `validator/`, never under `PLAYGROUND_REPO`.
- If something we need isn't already built in interact-xp, we bundle/derive it into the validator from
  source — we do NOT build it in place.

## Architecture

```
Validator UI (loop view in Prompts tab)          Validator backend (Express)
  section picker · N preview iframes                 ├─ lib/playground.js  POST :5173/api/generate (per section)
  score(1–10)+notes · rounds rail (trend/rollback)   ├─ lib/refine.js      runAgent → rewrite guideline (streamed)
  iframes import /render-runtime.js  ────────────▶   ├─ lib/loop-store.js  <prompt>.history.json (rounds)
  reuse progress + agent-activity modal              └─ serves render-runtime.js (esbuilt renderer)
```

Config via env: `PLAYGROUND_REPO` (default `~/Documents/Dev/Wix/interact-xp`),
`PLAYGROUND_URL` (default `http://localhost:5173`).

### New backend modules

**`lib/playground.js`**
- `listSections()` → `[{ id, html, css }]` read from `<PLAYGROUND_REPO>/apps/playground/src/sections/*`
  (prefer `section.sanitized.html` when present, else `section.html`; read `section.css`). Read-only.
- `buildPayload({ html, css, guideline })` → `{ user_input, system_rules }` using the playground's
  `buildGenerate()` + `EXPERIENCE_SCHEMA`. `guideline` → `userPromptExample`; a fixed instruction
  string ("Apply the animation pattern described in the example to this section; follow its Selector
  Contract and Interact Template, adapting roles to this section's DOM.") → `userPrompt`.
  - `buildGenerate` is imported from the interact-xp built package. `EXPERIENCE_SCHEMA` is obtained
    once (via a setup script run against the repo) and **vendored** into the validator as
    `render/experience.schema.json` so runtime has no TS-compile dependency.
- `generate({ html, css, guideline })` → POST `PLAYGROUND_URL/api/generate`, return
  `{ config, sessionId }`. v1 returns the config as-is (no repair loop — invalid configs surface as a
  render error card; a repair loop is a later enhancement).
- `status()` → boolean; pings `PLAYGROUND_URL` to check the dev server is up.

**`lib/refine.js`**
- `buildRefinePrompt({ guideline, score, notes })` → `{ system, user }`. System: "You refine a
  GENERAL @wix/interact animation guideline from holistic, cross-section feedback. Do NOT overfit to
  any single generated output. Keep every section (Selector Contract, Role Guidance, Required Styles,
  Interact Template, Suggested Controls) intact and general. Return ONLY the full updated guideline
  markdown." User: current guideline + `Score: N/10` + notes.
- `refineGuideline({ guideline, score, notes, onDelta, runAgent })` → new markdown (fence-stripped),
  streaming reasoning via `onDelta`.

**`lib/loop-store.js`** (history; path-safe, scoped to `Ani-Mate Prompts/`)
- History file: `Ani-Mate Prompts/<promptRel>.history.json` =
  `{ working: string, rounds: [{ round, guideline, sections: [{ id, config }], score, notes }] }`.
- `readLoop(rootDir, promptRel)` → `{ working, rounds }` (working defaults to the `.md` content, rounds `[]`).
- `recordRound(rootDir, promptRel, { guideline, sections, score, notes, newWorking })` → appends a round,
  sets `working = newWorking`.
- `rollback(rootDir, promptRel, round)` → sets `working` to that round's guideline.
- `finalize(rootDir, promptRel)` → writes `working` to the prompt's `.md` (via prompts.js), leaves history.

### New endpoints (in `server.js`)

| Endpoint | Purpose |
|---|---|
| `GET /api/playground/status` | `{ up: bool }` — is the dev server reachable |
| `GET /api/playground/sections` | `{ sections: [{id}] }` — available section ids |
| `GET /api/loop?promptPath=` | `{ working, rounds }` — history for a prompt |
| `POST /api/loop/run` `{promptPath, sections}` | SSE: per-section `result` `{id, config}` + `log` (reasoning) + `done`; uses the **working** guideline |
| `POST /api/loop/refine` `{promptPath, score, notes, sections, configs}` | SSE: `log` (reasoning) + `done` with the new guideline; records the round |
| `POST /api/loop/finalize` `{promptPath}` | writes working → `.md` |
| `GET /render-runtime.js` | serves the bundled renderer (static) |

`/api/loop/run` and `/api/loop/refine` reuse the SSE pattern from `/api/fix` (Accept:
`text/event-stream`), with `mapLimit` bounded concurrency across sections.

### Rendering (browser)

A render iframe loads a small self-contained doc: inject the section `html` + `css`, import
`/render-runtime.js` (bundled `createExperience`) and `@wix/interact@2.5.1/web` as needed, then
`createExperience(config, { root })` against the injected section root. One iframe per section,
laid out side by side. Reuses the `injectBase` technique where relevant.

### UI (`public/` — extends app.js / index.html / styles.css)

Prompts tab, on a selected prompt:
- **Start refine loop** button → loop view (replaces or overlays the markdown view).
- **Section picker**: chips for the available sections; pick 2–4.
- **Preview grid**: 2–4 labeled iframes rendering each section with its generated config.
- **Feedback bar**: score slider (1–10) + notes textarea + **Generate again** / **Refine**.
- **Rounds rail**: list of rounds with score, a small trend sparkline, click-to-view (loads that
  round's configs + notes), **rollback**, and **Close loop** (finalize).
- Reuses the existing **progress** panel and **Agent activity** modal for both generate and refine.

## Data flow (one round)

1. Pick sections → **Generate**: `POST /api/loop/run` with the working guideline; backend fans out
   `generate()` per section (bounded), streams reasoning + per-section `{id, config}`.
2. UI renders each section+config in its iframe.
3. User sets score + notes.
4. **Refine**: `POST /api/loop/refine`; backend streams the agent rewriting the guideline generally,
   records round N (`guideline` used, `sections+configs`, score, notes), sets working = new guideline.
5. **Generate again** uses the new working guideline. Repeat.
6. **Close loop**: `POST /api/loop/finalize` writes working → `.md`.

## Error handling

- **Playground down** → `/api/playground/status` false → loop UI shows "start the playground
  (`cd apps/playground && npm run dev`)" and disables Generate; no mid-round failures.
- **Per-section generate failure** → that slot shows an error card; other sections still render
  (per-section isolation, like the fix batch).
- **Invalid/unrenderable config** → the iframe shows a render-error card for that section.
- **Path safety** → history + prompt paths scoped to `Ani-Mate Prompts/` (reuse prompts.js guards).
- **interact-xp repo missing / buildGenerate not importable** → surfaced as a clear setup error.

## Testing

- **Unit (pure/backend, agent+network mocked):** `buildPayload` (guideline→userPromptExample,
  instruction→userPrompt, schema embedded); `buildRefinePrompt` (general/no-overfit instruction
  present, score+notes embedded); `loop-store` (readLoop defaults, recordRound append, rollback,
  finalize writes `.md`); `listSections` against a temp fixture; path-safety on history.
- **Integration:** `/api/loop/run` and `/refine` SSE shape with a mocked generator/agent; status endpoint.
- **Manual smoke:** the esbuild spike (renderer bundles + applies a config in a page); one live round
  against the running playground (generate → render → score → refine). Pixels/live generation aren't unit-testable.

## Implementation sequencing (for the plan)

1. **Spike:** esbuild `@wix/interact-experience-renderer` → `render-runtime.js`; apply a sample config
   in a page. Gate: if it can't bundle cleanly, stop and revisit (fallback: browser automation).
2. **Backend generate:** `playground.js` (sections, buildPayload, generate, status) + endpoints + tests.
3. **History:** `loop-store.js` + endpoints + tests.
4. **Refine:** `refine.js` + endpoint + tests.
5. **UI:** loop view, section picker, preview grid, feedback bar, rounds rail; wire streaming + render.

## Out of scope (v1)

- The generate repair loop (`buildRepair`) the playground UI does — v1 surfaces invalid configs instead.
- Launching the playground automatically — the user runs it; we detect and message.
- Multi-user / remote; browser automation of the playground UI.
- Editing sections or adding new ones from the validator.
