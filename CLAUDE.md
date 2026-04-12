# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Project

All HTML files require a local web server (browser security blocks `fetch` from `file://`):

```bash
cd interact-examples
npx serve .
# or
python3 -m http.server
```

Open `http://localhost:3000/explorer.html` to browse all animations interactively.

## Project Purpose

A collection of `@wix/interact` animation examples — ~130 standalone HTML files across 8 directories demonstrating scroll-driven, hover, pointer-tracking, click, and continuous loop animations. The **Animation Explorer** (`explorer.html`) is the primary tool: it previews any animation in an iframe and exposes live slider controls for customization. Currently 63 of the ~130 animations are wired into the explorer.

### Directory Layout

| Directory | Count | Description |
|-----------|-------|-------------|
| `Gallery-and-Carousel/` | 41 | Gallery, carousel, and layout animations |
| `Typographic_interactions/` | 32 | Text and typography animations |
| `Image_Background/` | 19 | Image/background effects (shape masks, reveals, slideshows) |
| `Lists/` | 8 | List and repeater animations |
| `text_Image/` | 5 + 3 subdirs | Text + image combo animations |
| `UI-elements-reyan/` | 10 | UI element animations (Reyan's versions) |
| `interact-UI-elements/` | 10 | UI element animations (interact versions) |
| `interact-WIP/` | 2 | Work-in-progress animations |
| `Animations not Interact/` | 1 | Non-interact reference animation |
| `analysis/` | — | Slider analysis CSVs, taxonomies, matrices, build scripts |

## Architecture

### Animation HTML Files

Each animation is a self-contained HTML file that:
1. Imports `@wix/interact` from CDN (`esm.sh`)
2. Wraps interactive elements in `<interact-element data-interact-key="...">` custom elements
3. Calls `Interact.create(config)` once with a declarative config object

The config has three sections:
- **`effects`**: Named, reusable effect definitions (keyframe, named preset, CSS transition, or custom JS)
- **`conditions`**: Named predicates gating interactions by media query, container query, or CSS selector state
- **`interactions`**: Trigger → element → effects mappings

### explorer.html

A single-file SPA (~2600 lines). Its key mechanism: animation HTML is `fetch()`-ed, a `<base href>` and a **bridge script** are injected, then loaded via `iframe.srcdoc`. The bridge monkey-patches `Element.prototype.animate` to intercept Web Animations and responds to `postMessage` commands:

| Command | Effect |
|---------|--------|
| `setSpeed` | Calls `updatePlaybackRate()` on all tracked animations |
| `setCss` | Injects a CSS `!important` rule into the iframe |
| `setCssVar` | Sets a CSS custom property on `:root` |
| `setScrollSpeed` | Triggers an iframe reload with height-scaled HTML |
| `reset` | Reloads the iframe at default state |

The **scroll speed slider** works differently from all others: it modifies the animation's HTML source before loading — scaling `height` values > 200vh or > 2000px by `1/speed` — because `@wix/interact` computes ViewTimeline scroll ranges at initialization time and playbackRate changes compress the range instead of extending it.

All slider configuration lives in the `animations` array inside `explorer.html`. Each entry has:
```js
{
  dir, file, name, desc,
  triggers: ['viewProgress' | 'hover' | 'click' | ...],
  sliders: {
    animation: [{ label, type: 'speed'|'css'|'cssVar', min, max, step, val, unit, ... }],
    layout:    [{ label, type: 'css'|'cssVar', sel, prop, min, max, step, val, unit }]
  }
}
```

## Key @wix/interact Rules

**Overflow**: Never use `overflow: hidden/auto` on scroll containers — use `overflow: clip`. These break ViewTimeline.

**Stacking contexts**: Avoid `transform`, `filter`, `opacity < 1`, `will-change`, `isolation: isolate` on any ancestor of a `viewProgress` target — they freeze ViewTimeline sampling. Apply visual effects to inner children instead.

**Effect types** (in preference order):
1. `namedEffect` — GPU-tuned presets from `@wix/motion-presets` (FadeIn, ParallaxScroll, Tilt3DMouse, etc.)
2. `keyframeEffect: { name, keyframes }` — standard WAAPI keyframes for custom animations
3. `customEffect: (element, progress) => void` — only when DOM manipulation or randomness is required

**Scroll-driven fill**: Always use `fill: 'both'` for `viewProgress` animations to avoid flicker at range boundaries.

**`pointerMove` + `keyframeEffect`**: Requires `params: { axis: 'x' | 'y' }`. For 2D pointer effects, use `namedEffect` mouse presets (TrackMouse, Tilt3DMouse) or `customEffect`.

**State toggles**: Use `TransitionEffect` with `StateParams.method: 'toggle'|'add'|'remove'|'clear'` for CSS-transition-style state. Use `PointerTriggerParams.type: 'alternate'|'repeat'|'once'|'state'` for time-based animations.

## Current Workflow State

Manually reviewing each animation in `explorer.html` to audit and improve sliders (ranges, types, defaults), and adding new animations that aren't yet in the explorer. **Do not edit files in `analysis/`** until all animations are finalized — `explorer.html`'s `animations` array is the single source of truth during this phase. Do not modify the bridge, sidebar, or loading infrastructure unless something is broken.

## Reference Files

- `full-lean.md` — Complete `@wix/interact` API documentation (quick start, config, effects, triggers, etc.)
- `analysis/conclusions.md` — Pattern taxonomy and slider analysis findings
- `analysis/animation_taxonomies.md` — Animation categorization by pattern type

## Known Limitations

- **Scroll speed threshold**: Only heights > 200vh / > 2000px are scaled. `CornerFoldScroll` and `textFoldTransition` use multiple 100vh sections and won't scale without custom handling.
- **Some `text_Image/` files use JSX/React** (e.g., `extrude_Swivel`) and won't render in a vanilla iframe.
- **CSS slider `!important` overrides** can conflict with existing `!important` rules in animation source.
- **UI element animations** (UI-elements-reyan, interact-UI-elements) are a different category from gallery/typographic animations — they demonstrate form controls, toggles, dropdowns, etc.
