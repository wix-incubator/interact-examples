# AGENTS.md — Animation Explorer Project Context

## What This Project Is

A collection of `@wix/interact` animation examples (~130 standalone HTML files) organized across multiple directories, plus an **Animation Explorer** (`explorer.html`) that lets you preview each animation in an iframe and control it with customization sliders.

### Directory Structure

```
interact-examples/
├── explorer.html                  ← The explorer UI (single self-contained HTML file, ~2600 lines)
├── full-lean.md                   ← @wix/interact API documentation reference
├── AGENTS.md                      ← This file
├── CLAUDE.md                      ← Claude Code guidance
├── Gallery-and-Carousel/          ← 41 gallery/carousel/layout animations
├── Typographic_interactions/      ← 32 typographic/text animations
├── Image_Background/              ← 19 image/background effect animations
├── Lists/                         ← 8 list/repeater animations
├── text_Image/                    ← 5 HTML files + 3 subdirectories (text + image combos)
├── UI-elements-reyan/             ← 10 UI element animations (Reyan's implementations)
├── interact-UI-elements/          ← 10 UI element animations (interact implementations)
├── interact-WIP/                  ← 2 work-in-progress animations
├── Animations not Interact/       ← 1 non-interact animation (for reference)
├── analysis/                      ← Slider analysis CSVs, taxonomies, matrices, build scripts
└── explorer-screenshots/          ← Screenshots of the explorer UI
```

### Explorer Coverage

The explorer currently contains **63 animations** across 3 directories:
- **Gallery-and-Carousel**: 37 of 41 on disk (missing: 3DSmallCarousel, CardSpread_7, Looping_Sphere_Gallery, SpecimenCardGallery)
- **text_Image**: 3 of 8 on disk (missing: pointer-scale-scroll-blur, pointer-track-scroll-fade, shape-mask-parallax, scroll-blur-split-layout, scroll-tilt-reveal)
- **Typographic_interactions**: 23 of 32 on disk (missing: 3D-Rolodex-Flip, Accelerated3DSpin, Mindshift Transition, The Iris Gate, Waterfall_Text, cards-peel-off-scroll, stacked-text-cards-scroll, text-cards-slide-in, text-fade-3d-perspective)

**Not yet in explorer**: Image_Background (19), Lists (8), UI-elements-reyan (10), interact-UI-elements (10), interact-WIP (2).

---

## Current Workflow

We are **manually going through each animation one by one** in `explorer.html` to:

1. Test and tweak the existing sliders
2. Add new sliders that are useful for each specific animation
3. Remove sliders that don't work or aren't meaningful
4. Adjust slider ranges (min/max/step/default) to sensible values
5. Add new animations from disk that are not yet in the explorer

All slider configurations are **hardcoded** in the `animations` array inside `explorer.html`. They are NOT loaded from the CSV at runtime.

**After all animations are finalized**, the CSV files in `analysis/` will be updated to match the final state of `explorer.html`.

---

## Key Technical Details

### explorer.html Architecture

The explorer is a single-file SPA (~2600 lines) with:

- **Sidebar**: Collapsible list of all animations, grouped by directory, with search
- **Preview iframe**: Full-bleed preview loading animations via `fetch` → HTML modification → `srcdoc`
- **Slider panel**: Draggable glass-morphism panel with two tabs (Animation / Layout) with range sliders per animation
- **Keyboard nav**: Arrow keys to switch animations, Cmd+B to toggle sidebar

### How Animations Load (srcdoc + Bridge)

1. The animation HTML is fetched via `fetch()` and cached in `cachedHtml`
2. A `<base href>` tag is injected so relative URLs (images, CDN scripts) resolve correctly
3. A **bridge script** (`BRIDGE_SCRIPT`) is injected before `</body>` — it:
   - Monkey-patches `Element.prototype.animate` to track all Web Animations
   - Listens for `postMessage` commands from the parent explorer
   - Handles: `setSpeed`, `setCss`, `setCssVar`, `setScrollSpeed`, `reset`
4. The modified HTML is loaded via `iframe.srcdoc` (same-origin, enabling postMessage)

### Slider Types

Each slider in the `animations` array has a `type`:

| Type | What it does | When it applies |
|------|-------------|-----------------|
| `speed` | For **non-scroll** animations: sends `setSpeed` to bridge, which calls `updatePlaybackRate()` on all tracked Web Animations. For **scroll-driven** animations (`viewProgress` trigger): reloads the iframe with **height-scaled HTML** so the scroll range changes while the animation stays 0–100%. | `applySlider` auto-detects based on `triggers` array |
| `css` | Injects a CSS rule with `!important` via the bridge's `setCss` handler | Any animation |
| `cssVar` | Sets a CSS custom property on `:root` via the bridge's `setCssVar` handler | Animations using CSS variables |

### Scroll Speed (for scroll-driven animations)

Scroll-driven animations use `viewProgress` as their trigger. The "Scroll Speed" slider works differently from regular speed:

- **How scroll-driven animations work conceptually**: Each scroll animation has a tall scroll section (e.g. 400vh) containing a `position: sticky` inner container (100vh) that stays pinned in the viewport. The animation progresses from 0% → 100% as the user scrolls through the full length of that tall section. **Scroll speed is really section length** — a longer section means more scrolling to complete the animation (slower), a shorter section means less scrolling (faster). The "Scroll Speed" slider controls this by scaling the section height: speed 2× → half the height → animation completes in half the scroll distance → feels faster. Speed 0.5× → double the height → twice as much scrolling needed → feels slower.
- **It modifies the HTML source before loading**, not after — this is critical because `@wix/interact` computes its `ViewTimeline` scroll ranges at initialization time
- `scaleScrollHeights(html, speed)` uses regex to find and scale height values:
  - CSS `height: Nvh` where N > 200 → scaled by `1/speed`
  - CSS `height: Npx` where N > 2000 → scaled by `1/speed`
  - Tailwind `h-[Nvh]` where N > 200 → scaled by `1/speed`
  - Tailwind `h-[Npx]` where N > 2000 → scaled by `1/speed`
- The slider uses `change` event (mouse release) instead of continuous `input`, since it requires an iframe reload
- `currentScrollSpeed` state persists across reloads; resets to 1 when switching animations
- The label dynamically shows **"Scroll Speed"** instead of "Animation Speed"

### Data Shape for Each Animation

```js
{
  dir: 'Gallery-and-Carousel',                    // directory name
  file: 'CardSpread.html',            // filename
  name: 'Card Spread',                // display name
  desc: 'Scroll-driven card spread…', // short description
  triggers: ['viewProgress'],         // interact trigger types
  animText: '…',                      // raw animation parameter notes
  layoutText: '…',                    // raw layout parameter notes
  sliders: {
    animation: [
      { label:'Animation Speed', type:'speed', min:0.1, max:3, step:0.1, val:1, unit:'×' },
      // more sliders…
    ],
    layout: [
      { label:'Card Border Radius', type:'css', sel:'.card', prop:'borderRadius', min:0, max:40, step:1, val:16, unit:'px' },
      // more sliders…
    ]
  }
}
```

### Trigger Types and Their Meaning

| Trigger | Description | Speed behavior |
|---------|-------------|---------------|
| `viewProgress` | Scroll-driven (ViewTimeline) | Scroll height scaling (iframe reload) |
| `viewEnter` | Fires once when element enters viewport | `updatePlaybackRate` |
| `hover` | Mouse enter/leave | `updatePlaybackRate` |
| `pointerMove` | Continuous mouse tracking | `updatePlaybackRate` |
| `click` | Click interaction | `updatePlaybackRate` |
| `pageVisible` | Fires on page load | `updatePlaybackRate` |
| `customEffect` | JS-driven custom logic | `updatePlaybackRate` |
| `toggleEffect` | Toggle state | `updatePlaybackRate` |

---

## Rules for Editing Sliders

1. **All changes go in `explorer.html`** — the `animations` array is the single source of truth during this phase
2. **Do NOT edit `animation_sliders.csv`** until all animations are finalized
3. **Do NOT change the explorer infrastructure** (bridge, sidebar, loading logic) unless something is broken
4. When adding a slider, pick the right `type` (`css`, `cssVar`, or `speed`) and provide sensible `min`/`max`/`step`/`val` defaults
5. For `css` type sliders, the `sel` must match elements inside the animation's HTML, and `prop` is the camelCase JS property name (converted to kebab-case automatically)
6. Test that slider ranges produce visible but non-breaking changes
7. The `val` should be the animation's actual default value

---

## Analysis Directory

The `analysis/` folder contains prior slider analysis work:

- `animation_sliders.csv` / `animation_sliders_readable.csv` / `new_animation_sliders.csv` — CSV catalogs of animations + sliders (snapshots, not yet synced with current explorer state)
- `animation_taxonomies.csv` / `animation_taxonomies.md` — Pattern categorization of animations
- `conclusions.md` — Analysis findings (14 pattern categories, slider coverage insights)
- `slider_analysis.md` — Detailed slider audit notes
- `slider_animation_matrix` files — Cross-reference matrices (CSV + XLSX)
- `build_matrix.py` — Script to generate the matrix

**Do NOT edit these files** until the explorer slider audit is complete.

---

## What's Next

1. **Audit existing 63 explorer animations** — go through each one, test sliders, fix ranges, add/remove as needed
2. **Add missing animations** from existing directories to the explorer (18 files in Gallery-and-Carousel, text_Image, Typographic_interactions not yet included)
3. **Add new directories** to the explorer — Image_Background (19), Lists (8), and potentially UI-elements-reyan / interact-UI-elements
4. **Update analysis CSVs** to reflect the final slider configurations

For each animation:
- Visually inspect the animation
- Test existing sliders — do they work? Are ranges sensible?
- Add useful sliders that are missing
- Remove sliders that don't produce meaningful results
- Note any animations that need special handling (e.g., CornerFoldScroll and textFoldTransition use multiple 100vh sections that aren't caught by the > 200vh scroll speed threshold)

---

## Running the Explorer

The explorer requires a local web server (for `fetch` to work):

```bash
cd interact-examples
npx serve .
# or
python3 -m http.server
```

Then open `http://localhost:3000/explorer.html` (or whatever port).

---

## Known Limitations

- **Scroll speed threshold**: Only heights > 200vh / > 2000px are scaled. Animations using multiple 100vh sections (CornerFoldScroll, textFoldTransition) won't scale with the scroll speed slider without custom handling.
- **Some text_Image files use JSX/React** (e.g., `extrude_Swivel`) and won't render in a vanilla iframe.
- **The bridge's `setSpeed`** (playbackRate) compresses scroll-driven animation ranges instead of extending them — that's why scroll-driven animations use the HTML-source-scaling approach instead.
- **CSS slider overrides** use `!important` which can conflict with existing `!important` rules in the animation source.
- **UI element animations** (UI-elements-reyan, interact-UI-elements) are a different category from the gallery/typographic animations — they demonstrate form controls, toggles, dropdowns, etc. and may need different slider patterns.
