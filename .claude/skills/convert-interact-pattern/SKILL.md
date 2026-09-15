---
name: convert-interact-pattern
description: Convert a standalone HTML/CSS/JS @wix/interact animation demo into a structured prose pattern guideline — selector roles, required styles, adaptation notes, a selector contract, suggested controls, and an interact template. Handles both generic and Wix compositions. Returns the guideline inline in chat or writes it to a markdown file. Use when turning an interact demo into a reusable, adaptable animation pattern spec.
---

# Convert Interact Pattern

Turn a standalone `@wix/interact` animation demo (HTML + CSS + JS) into a **plain-prose guideline** that
describes the animation as a reusable, adaptable pattern: which DOM roles matter, which styles are
structural, how to adapt it to a real composition, and the interact config to reproduce it.

This skill is self-contained. It does not depend on any particular repository or build step.

## Output

When you finish, deliver the guideline in whichever way fits the request:

- **Inline in chat** — print the full markdown as your answer (default when the user just wants the result).
- **As a file** — write it to `<pattern-id>.guideline.md` in the current working directory, or to a path the
  user specifies.

If the user hasn't said which, ask briefly or default to inline. Do not assume any repo layout or run any
project build/typecheck commands.

## Output Contract

Read the bundled exemplar **`reference/example.guideline.md`** (in this skill's folder) and match its
structure exactly. The guideline MUST have, in this order:

1. `# <Name>` — the H1 display name.
2. A one-line tagline.
3. `## Summary` with these bullets:
   - `` - **ID:** `kebab-case-id` `` — a stable id, backtick-wrapped.
   - `- **Target shape:** <one sentence>` — short structural fit guidance (what kind of section it suits).
   - `- **Description:** <one or two sentences>`
4. `## Demo HTML` — a fenced `html` block showing structure only.
5. `## Selector Contract` — numbered hard selector rules and invalid adaptations.
6. `## Role Guidance` — a `| Role | Guidance |` table of short role-level mapping signals.
7. `## Adaptation Notes` — a numbered list of formulas, edge cases, and force-fit behavior.
8. `## Required Elements` — a `| Key | Role | Demo Selector | Purpose |` table. Choose one of two patterns based on how items are structured in the demo:
   - **Fixed items** (`card1`, `card2`, …) — use when the item count is known at authoring time and each element gets its own `data-interact-key`. See `reference/example-fixed.guideline.md`.
   - **List container** (`listContainer`) — use when items are dynamic or grabbed at runtime from a parent. A single `listContainer` key points to the parent; a `customEffect` iterates over its children. See `reference/example-list.guideline.md`.
9. `## Required Styles` — one `### \`role\` — \`selector\`` block per style, each with a fenced `css`
   block (real kebab-case CSS) and a `Reason:` line.
10. `## Suggested Controls` — see below; always present, never empty.
11. `## Interact Template` — the config as fenced `ts` blocks (helper functions + the interaction),
    using the required-element keys, not raw demo selectors.

Keep the `# ` H1, the `**ID:**` line, and the `**Target shape:**` line in exactly that format — they form
the machine-readable summary a catalog can parse out of the file.

## Workflow

1. **Determine target platform.** Ask the user whether the target composition is a Wix site, or infer
   from context if it's already clear. This controls whether **Wix DOM Mapping** applies throughout the
   rest of the steps.
2. Read the demo HTML, CSS, and JS, and read the bundled `reference/example.guideline.md` for format.
3. Identify the animation mechanism, not the decoration: scroll source, sticky or moving stages, repeated items, transforms, ranges, and any dynamic formulas.
4. Convert demo selectors into reusable roles. Prefer roles like `scrollSource`, `stickyStage`, `stickyFrame`, `collection`, `stackList`, `horizontalTrack`, and `repeatedCard`. If Wix, also note the corresponding Wix selector for each role (see **Wix DOM Mapping** below).
5. Write `## Selector Contract` before `## Role Guidance` for non-negotiable mapping rules and known invalid adaptations. If Wix, include Wix-specific selector constraints inline.
6. Keep `## Required Elements` to the minimum viable pattern. For repeated items, choose the right pattern:
   - **Fixed items**: use when count is known. Require three items minimum; keys MUST end in a digit (`card1`, `card2`, …) so they compact into `card{n}`; instruct adaptation to extend `card4..cardN`; add a repeated-card-keys note after the table.
   - **List container**: use when items are dynamic or the count is not fixed. A single `listContainer` key points to the parent; document how the `customEffect` selects children.
   If Wix, add Wix selector guidance in the Purpose column.
7. Put structural CSS in `## Required Styles`; keep visual styling out unless it is required for animation correctness.
8. Convert imperative demo JS into a static `## Interact Template` with helper functions. Use illustrative values and tell the agent which values must be recomputed.
9. Always author `## Suggested Controls` (see rules below).
10. Keep the guidance lean. Prefer 3-5 high-signal bullets per section and do not restate the same constraint across Selector Contract, Role Guidance, and Adaptation Notes.
11. Output the finished guideline (inline or as a file, per **Output** above).

## Wix DOM Mapping

*Apply this section only when the target is a Wix composition.*

Translate generic roles to Wix selectors using these rules:

- **`scrollSource`** — the outermost section comp: `#comp-<id>` (the element whose scroll drives the `viewProgress` trigger).
- **`stickyStage`** — internal-container-root: `#comp-<id>` with `data-testid="internal-container-root"`. This is the sticky outer wrapper, not its content child. Use the rendered `#comp-...` id, not `DESKTOP--...`.
- **`collection`** — internal-container-content: `#<stickyStageCompId> [data-testid="internal-container-content"]`. This must always be a child of `stickyStage` and must resolve to a different element.
- **Repeated items** — use rendered `#comp-<id>` ids. Never use `DESKTOP--...` ids; those are editor-internal and absent from the live DOM.

Before generating the guideline, confirm in the DOM that `stickyStage` and `collection` resolve to different elements. If they collapse to the same selector, reject the pattern (see Extraction Rules).

## Suggested Controls

Every guideline must name **1-3 suggested controls** — the pattern's core user-facing knobs
(spread, spacing, intensity, scroll distance, perspective, scale, tilt, offset, duration), chosen
for quality over quantity. Describe each knob *conceptually* — what it changes and a sensible range.
How a knob becomes a valid binding is the generator's job, not this guideline's; do not specify
binding targets, transforms, or the interact binding model here. Author a one-line intro, then
one `### <control-id>` block per control with these bullets:

- `**Label:** <Title Case>`
- `**Group:** <Layout | Motion | ...>`
- `**Type:** range | select | color | toggle | text`
- `**Default:** <value>`
- `**Description:** <what the knob changes>`
- `**Constraints:** min / max / step / unit` (as applicable)
- `**Suggested variable:** <--kebab-name>` (optional) — a CSS custom property the pattern's styles or
  keyframes could read, offered as a hint for the generator. This is a naming suggestion, not a binding.

Pick knobs that are stable and safe to expose; avoid incidental demo numbers that would break the
pattern when changed.

## Extraction Rules

- Preserve role ownership. Scroll distance belongs to the scroll source; sticky pinning belongs to a shared frame/stage; collection sizing belongs to the collection/track; item transforms belong to repeated item roots.
- Treat literal demo numbers as examples. Translate them into formulas or adaptation notes when they depend on viewport, item count, card size, gap, or layout.
- Keep DOM roles distinct when the pattern depends on them. If a pattern needs `stickyStage` and `collection`, their selectors must not collapse to the same element.
- Use specific selectors for repeated items. Avoid broad selectors like `.image` unless the section truly has no better mapping.
- Target repeated item roots, not raw `img` descendants, unless the animation specifically operates on image content inside a stable card root.
- For repeated items, prefer formula-driven guidance over serializing one near-identical style entry per card when the placement can be derived from item index and count.
- Use `overflow: clip` for viewProgress clipping roles. Avoid `overflow: hidden` on viewProgress ancestors.
- Include forced-fit guidance only when CSS can safely create the missing local structure without moving DOM nodes.
- State invalid adaptations explicitly, but once is enough. The agent needs crisp negative examples, not repeated warnings.
- **Reject and report** when a pattern's structural invariant cannot be satisfied in the target composition (e.g., `stickyStage` and `collection` must remain distinct selectors). Do not produce a guideline for a broken mapping — tell the user which role collapsed and why.

## Review Checklist

- The guideline has all eleven sections and the parseable summary block (H1, `**ID:**`, `**Target shape:**`).
- Every Interact Template effect key appears in `## Required Elements`.
- Every structural role used in `## Required Styles` appears in `## Role Guidance`.
- Repeated keys end in a digit and a repeated-card-keys note is present; item-count changes are explained.
- Dynamic distances and ranges say how to recompute them.
- `## Suggested Controls` has 1-3 controls, each with a label, range, and what it changes (no binding spec).
- The guideline warns against the most likely broken mapping.
- *(Wix only)* Wix selector patterns (`#comp-...`, `data-testid`) are present in the Selector Contract and Required Elements Purpose column.
- The result is delivered inline or written to the requested file.
