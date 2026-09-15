# Column Squeeze Reveal

A left text column squeezes narrow while its headline shrinks and the background image zooms, all pinned on scroll.

## Summary

- **ID:** `column-squeeze-reveal`
- **Target shape:** Best for a full-bleed section with a vertical text/label column overlaid on a single background image, where the column can pin to the viewport and reveal more of the image as it narrows.
- **Description:** A sticky stage holds a narrow left column over a background image; as the section scrolls, the column's inner panel squeezes from wide to narrow, the headline scales down, and the background image zooms in.

## Demo HTML

```html
<section class="scroll-driver">
  <div class="sticky-stage">
    <div class="right-col">
      <div class="bg-image-el">
        <div class="bg-image"></div>
      </div>
    </div>
    <div class="left-col">
      <div class="left-inner">
        <div class="elegant-blurb"><p>Static intro copy…</p></div>
        <div class="hero-text-wrap">
          <div class="hero-text-inner">
            <span class="hero-word hero-w1">Built</span>
            <span class="hero-word hero-w2">Space</span>
          </div>
        </div>
      </div>
    </div>
    <div class="scroll-cue">…</div>
  </div>
</section>
```

## Selector Contract

1. Role ownership is strict: `scrollSource` owns the tall runway, `stickyStage` owns the pin and clip, `squeezePanel` owns the width animation, `headline` owns the text scale, and `backgroundLayer` owns the zoom.
2. `scrollSource` and `stickyStage` must be different selectors; the runway (`300vh`) sits on the outer section and the pin (`sticky`, `100vh`) sits on the inner stage.
3. The width animation targets the panel's own inner wrapper (`.left-inner`), not the positioned `left-col` overlay — animating the overlay's own width would move its absolute anchoring, not reveal the image.
4. The zoom targets the background media element (`.bg-image`), never the sticky stage or an ancestor of the `viewProgress` targets; scaling an ancestor freezes ViewTimeline sampling.
5. Keep the background and column as distinct stacked layers (`z-index` ordered); collapsing them into one element breaks the reveal.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | The tall outer section whose height creates the `viewProgress` scroll distance. |
| `stickyStage` | A sticky viewport-height frame that pins the composition and clips overflow during scroll. |
| `squeezePanel` | The inner wrapper of the overlaid text column whose width animates from wide to narrow. |
| `headline` | The oversized display text inside the column that scales down as the column narrows. |
| `backgroundLayer` | The background image element behind the column that zooms in over the same range. |

## Adaptation Notes

1. Put scroll distance on `scrollSource` (`~300vh`) and pinning on `stickyStage` (`100vh`); never merge them onto one element.
2. Squeeze the column by animating `width` on `squeezePanel` (e.g. `22vw → 9vw`); recompute both endpoints from the real column width so the ending panel still fits its content legibly.
3. Scale the headline on `headline` with `transform: scale()`; pick the end scale so the text fits the narrowed column (demo uses `1 → 0.41`) rather than copying the literal factor.
4. Zoom the background with `transform: scale()` on `backgroundLayer` only (demo `1 → 1.4`); keep `overflow: clip` on the stage and column so the zoom and squeeze stay masked.
5. All three effects share one range on the single `scrollSource` trigger — keep their `rangeStart`/`rangeEnd` identical so squeeze, scale, and zoom stay synchronized.
6. Reject the pattern if you cannot keep a distinct sticky stage, a clip-masked column panel, and a separate zoomable background layer.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollDriver` | `scrollSource` | `.scroll-driver` | The `viewProgress` source; tall runway for the whole pattern. |
| `stickyStage` | `stickyStage` | `.sticky-stage` | Sticky pin and clip frame; not itself animated. |
| `squeezePanel` | `squeezePanel` | `.left-inner` | Inner column wrapper whose `width` animates wide → narrow. |
| `headline` | `headline` | `.hero-text-inner` | Display text wrapper that scales down over the range. |
| `bgImage` | `backgroundLayer` | `.bg-image` | Background media element that zooms in over the range. |

## Required Styles

### `scrollSource` — `.scroll-driver`

```css
.scroll-driver {
  height: 300vh;
}
```

Reason: creates enough scroll distance for the squeeze, scale, and zoom to play out fully.

### `stickyStage` — `.sticky-stage`

```css
.sticky-stage {
  position: sticky;
  top: 1.5rem;
  width: calc(100vw - 3rem);
  height: calc(100vh - 3rem);
  overflow: hidden;
}
```

Reason: pins the composition to the viewport and clips the zooming image and squeezing column while the section scrolls.

### `squeezePanel` — `.left-inner`

```css
.left-inner {
  width: 22vw;
  height: 100%;
  position: relative;
  overflow: clip;
  background: #0a0a0a;
}
```

Reason: establishes the starting column width and clips its contents so the headline is masked as the panel narrows, progressively revealing the background.

### `backgroundLayer` — `.bg-image`

```css
.bg-image {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center top;
  transform-origin: center center;
}
```

Reason: fills the stage so a `scale()` zoom stays covered, and centers the transform origin so the zoom reads as a push-in rather than a drift.

### `headline` — `.hero-text-inner`

```css
.hero-text-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-origin: left bottom;
}
```

Reason: anchors the scale to the bottom-left so the shrinking headline stays pinned to the column corner instead of floating toward center.

## Suggested Controls

Expose the squeeze range and the background zoom as the primary knobs; add the headline end scale when the composition needs fine tuning.

### `squeeze-end`

- **Label:** `Column End Width`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `9`
- **Description:** Controls how narrow the text column becomes at the end of the scroll, and thus how much of the background image is revealed.
- **Constraints:** `min: 4`, `max: 18`, `step: 1`, `unit: vw`
- **Binding:** `variable` `--column-end-width` using template `${value}vw`

### `image-zoom`

- **Label:** `Image Zoom`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `1.4`
- **Description:** Controls the ending scale of the background image as the section scrolls past.
- **Constraints:** `min: 1`, `max: 1.8`, `step: 0.05`, `unit: x`
- **Binding:** `variable` `--bg-end-scale` using a direct value

### `text-scale`

- **Label:** `Headline End Scale`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `0.41`
- **Description:** Controls how small the headline shrinks so it stays inside the narrowed column.
- **Constraints:** `min: 0.25`, `max: 0.8`, `step: 0.01`, `unit: x`
- **Binding:** `variable` `--headline-end-scale` using a direct value

## Interact Template

```ts
// Shared scroll range for all three effects — keep identical so they stay synchronized.
const RANGE = {
  rangeStart: { name: 'entry', offset: { value: 100, unit: 'percentage' } },
  rangeEnd: { name: 'exit', offset: { value: 0, unit: 'percentage' } },
  fill: 'both' as const,
  easing: 'ease-in-out',
};

// Recompute endpoints from the real column width, headline size, and desired reveal.
const squeezeEffect = {
  key: 'squeezePanel',
  selector: '.left-inner',
  keyframeEffect: {
    name: 'squeeze-column',
    keyframes: [{ width: '22vw' }, { width: '9vw' }],
  },
  ...RANGE,
};

const headlineScaleEffect = {
  key: 'headline',
  selector: '.hero-text-inner',
  keyframeEffect: {
    name: 'scale-headline',
    keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(0.41)' }],
  },
  ...RANGE,
};

const zoomEffect = {
  key: 'bgImage',
  selector: '.bg-image',
  keyframeEffect: {
    name: 'zoom-image',
    keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }],
  },
  ...RANGE,
};

const interaction = {
  key: 'scrollDriver',
  trigger: 'viewProgress',
  effects: [squeezeEffect, headlineScaleEffect, zoomEffect],
};
```