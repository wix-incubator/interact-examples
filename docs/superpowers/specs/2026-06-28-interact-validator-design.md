# Interact Validator — Design Spec

**Date:** 2026-06-28
**Status:** Approved (brainstorm), pending implementation plan
**Author:** Hassan Kettany + Claude Code

## Problem

The `interact-examples` repo holds ~130 standalone `@wix/interact` animation HTML files,
contributed over a long period by multiple people (some non-technical). They have drifted:

- **10 different `@wix/interact` versions** are imported across files (1.78 → 2.4.0).
- Some files **don't use interact at all**.
- Some use **`customEffect`** where a `namedEffect`/`keyframeEffect` would be idiomatic.
- Some mix interact with **extra hand-written JavaScript** (manual listeners, observers, `.animate`).
- Some use **outdated syntax** from early v2 (pre-2.2.0).

Manually checking each file for version, correctness, and idiom is not sustainable.

## Goal

A **local validator tool with a UI** that:

1. Lists all animation files (with code view + live preview).
2. **Scans/diagnoses** every file (static analysis) and shows a categorized summary.
3. Lets the user **select files + fix options** (or a freeform prompt) and have a
   Claude agent rewrite them to use interact correctly, on the latest version,
   without extra JS (unless allowed).
4. Shows **diffs of drafts**, with live preview, before the user **applies** changes
   to the real files.

## Canonical reference facts (verified against github.com/wix/interact `master`)

- **Latest version: `2.4.0`** (pin as `LATEST`). Current major is v2.x.
- Custom element tag is **`<interact-element data-interact-key="...">`** (the repo's
  files using `wix-interact-element` are outdated — this is a detectable marker).
- `Interact.create({ interactions, effects?, sequences?, conditions? })`, called once.
- Three effect sources (exactly one per effect), preference order:
  `namedEffect` → `keyframeEffect` → `customEffect`.
- Named presets require `Interact.registerEffects(presets)` from `@wix/motion-presets`.
- **Key breaking change (2.2.0):** play-mode moved off `Interaction.params` onto the effect
  and was renamed — `params.type` → `triggerType` (on `TimeEffect`),
  `params.method` → `stateAction` (on `StateEffect`). These are mutually exclusive.
- **Range offset rename (2.1.0):** `{value, type}` → `{value, unit}`.
- **Typo fix (2.2.0):** `useCutsomElement` → `useCustomElement`.
- Official validator package exists: `@wix/interact-validate` (zod-based,
  `validateInteractConfig(config)`), reserved for a **phase-2 add-on**.
- Canonical CDN import: `https://esm.sh/@wix/interact@2.4.0`
  (+ `https://esm.sh/@wix/motion-presets`).
- Full API reference: project's `full-lean.md` (matches interact's `rules/full-lean.md`,
  current for 2.4.0 and already uses the new syntax — safe target spec).

## Design decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Agent backend | Claude **Agent SDK headless**, using existing Claude Code auth (no API key) |
| UI host | **Separate standalone app** in a new `validator/` dir; `explorer.html` untouched |
| Scan engine | **Static analysis only** in v1 (`@wix/interact-validate` = phase 2) |
| Draft/apply | **Sidecar drafts** in `.drafts/`, **git as the undo**; drafts cleared on apply |

## Architecture

```
┌─ Validator UI (browser) ─────────────┐
│  file list · code view · live preview │
│  scan dashboard · fix options · diffs  │
└───────────────┬───────────────────────┘
                │ REST (localhost)
┌───────────────▼───────────────────────┐
│  Node backend (server.js)              │
│   ├─ detect.js   (static analysis)     │  ← instant, free, deterministic
│   ├─ fix.js      (Agent SDK orchestr.) │  ← Claude rewrites → .drafts/
│   └─ apply/diff/discard (fs + git)     │
└────────────────────────────────────────┘
```

All new code lives under `validator/`. The live-preview iframe reuses explorer's
`<base href>`-injection + `srcdoc` technique, extracted into a small shared helper.

### Components

**1. Node backend (`validator/server.js`)** — serves the UI + REST API:

| Endpoint | Purpose |
|---|---|
| `GET /api/files` | Enumerate animation HTML files across known dirs; return metadata |
| `GET /api/file?path=` | Raw source for code view |
| `POST /api/scan` | Run `detect.js` over all/selected files; return per-file diagnosis + aggregate summary |
| `POST /api/fix` | Given files + options + custom prompt, run Agent SDK (bounded concurrency) → write `.drafts/`; report per-file progress/status |
| `GET /api/diff?path=` | Original vs draft diff |
| `GET /api/draft?path=` | Draft source (for live preview) |
| `POST /api/apply` | Overwrite original(s) from draft(s); clear applied drafts |
| `POST /api/discard` | Delete draft(s) |

Path-safety: every `path` is validated to resolve inside the repo root (no traversal).

**2. Static detection (`validator/detect.js`)** — pure `(path, source) → Diagnosis`:

```
Diagnosis = {
  usesInteract:    bool,        // imports @wix/interact
  version:         string|null, // parsed from import
  isLatest:        bool,        // version === LATEST (2.4.0)
  usesCustomEffect:bool,        // 'customEffect:' present
  usesExtraJs:     bool,
  extraJsSignals:  string[],    // addEventListener(scroll|mousemove|pointermove|click),
                                // IntersectionObserver, direct .animate(, rAF/setInterval loops
  oldSyntaxMarkers:string[],    // params.type/method as play-mode, wix-interact-element tag,
                                // {value,type} range offset, useCutsomElement typo
  category:        enum,        // Not using interact | Outdated version | Uses customEffect
                                //   | Uses extra JS | Clean & current
}
```

Drives per-file badges and the aggregate dashboard (counts + percentages per category).

**3. Fix orchestrator (`validator/fix.js`)** — for each selected file builds an agent
prompt from: chosen preset fragments + the file's static `Diagnosis` + canonical spec
context (`full-lean.md`) + freeform prompt. Invokes the Agent SDK (read original,
write draft only). Bounded concurrency (default 4). **Post-fix self-check:** re-run
`detect.js` on the draft; if still problematic, flag `needsReview` (draft still shown).

Preset fix options (each maps to a hidden prompt fragment, all spec-anchored):

- **Update to latest version** — bump imports to `@wix/interact@2.4.0` (+ motion-presets),
  migrate version-specific syntax.
- **Migrate old syntax** — `params.type/method` → `triggerType`/`stateAction`;
  `{value,type}`→`{value,unit}`; `wix-interact-element`→`interact-element`; fix `useCutsomElement`.
- **Convert customEffect → preset/keyframe** — when the customEffect maps to a known
  `namedEffect`/`keyframeEffect`.
- **Remove extra JavaScript** — replace manual listeners/observers/`.animate` with interact
  triggers/effects. **Defaults OFF** (the "unless I say so" lever).
- **Convert non-interact → interact** — rewrite a file that doesn't use interact at all.
- **Custom prompt box** — freeform, always appended.

**4. Validator UI (`validator/index.html` + js, vanilla)** —
- File list grouped by directory, with category badges, code-view toggle, live iframe preview.
- **Scan/Diagnose** button → dashboard (counts/percentages/category breakdown) + per-file diagnosis.
- Selection: checkboxes / select-all / filter-by-category.
- Fix options panel (preset toggles + freeform prompt box).
- **Run** → per-file progress.
- Per-file: side-by-side **diff** + **live preview of the draft**.
- **Apply** / **Discard**, per-file or batch.

### Data flow

UI → backend REST. Scan path is synchronous (`detect.js`, instant). Fix path is async:
Agent SDK → `.drafts/<original-path>.html`. Diff computed backend-side. Apply = copy
draft→original then remove draft. Git is the undo.

### Error handling

- Agent failure on a file → mark `fixFailed` with the error message; continue other files.
- Draft failing the post-fix self-check → flagged `needsReview` but still shown for manual diff.
- Backend rejects any path outside the repo root.
- Apply refuses when the draft is missing.

## Testing

- **`detect.js`** (pure) → unit tests against fixture HTML snippets: known outdated-version,
  customEffect, extra-JS, non-interact, and clean-current samples; assert each `Diagnosis` field.
- **Backend endpoints** → integration tests against a temp fixture dir (scan, diff, apply, discard,
  path-traversal rejection, apply-without-draft rejection).
- **Fix step** → unit-test the prompt-assembly function (`Diagnosis` + options → expected prompt),
  with the Agent SDK mocked. The agent's creative output is not deterministically testable;
  we test what is.

## Tech stack

- Node + minimal deps: `http`/Express, `@anthropic-ai/claude-agent-sdk`, a `diff` library.
- UI in vanilla JS (matches explorer's style; no framework).

## Out of scope (v1)

- `@wix/interact-validate` zod integration (phase 2).
- Modifying `explorer.html` or the `analysis/` files.
- Multi-user / remote hosting — local-only tool.
- Auto-commit on apply (git is the manual undo; user commits when ready).
