# Manifest Expand Scroll

Single-image block expands from a corner card into a full-frame hero through scroll.

## Summary

- **ID:** `manifest-expand-scroll`
- **Name:** `Manifest Expand Scroll`
- **Description:** A single large image begins as a cropped anchored block and expands through a sticky frame until it nearly fills the viewport, while the image zoom settles back to full scale.
- **Best for:** one dominant image or media block that can grow from a smaller anchored composition into a near full-bleed hero.

## Demo HTML

```html
<section class="sticky-track" id="scroll-section">
  <div class="sticky-frame" id="sticky-frame">
    <div class="image-wrap" id="image-box">
      <div class="image-container">
        <img id="hero-image" class="hero-image" />
      </div>
    </div>
  </div>
</section>
```

## Selector Contract

1. Role ownership is strict: `scrollSection` owns runway, `stickyFrame` owns sticky/clipping, `imageBox` owns expansion geometry, and `primaryImage` owns zoom.
2. `stickyFrame`, `imageBox`, and `primaryImage` must stay distinct selectors. `imageBox` is the absolute block inside the frame; `primaryImage` is the actual media surface inside it.
3. Use viewport units only for the outer runway and sticky frame. Animate `imageBox` with inset/top/right/bottom/left values inside the frame, not by resizing the section.
4. Prefer a concrete media selector over a broad `img` descendant. Recompute the start/end inset values from the real composition.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | Tall section whose `viewProgress` drives the expansion of the image block. |
| `stickyFrame` | Pinned viewport-sized frame that clips the expanding image composition. |
| `imageBox` | Absolute positioned image block that expands from a smaller anchored crop toward full-frame. |
| `primaryImage` | The image/media surface inside `imageBox` that zooms from 1.25 back to 1 as the box expands. |

## Adaptation Notes

1. Treat this as a single-image hero pattern, not a gallery pattern.
2. Adapt the start box to the real editorial crop; the demo corner and margin values are illustrative.
3. Usually keep the end box slightly inset from the viewport unless the section truly wants full bleed.
4. Keep width/height 100% and object-fit cover on `primaryImage` so the zoom reads as camera motion, not layout resize.
5. If the image has no dimensions after adaptation, `primaryImage` was probably mapped too deep; move it to the actual media root or stable media wrapper.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollSection` | `scrollSource` | `.sticky-track` | The `viewProgress` source for the expanding single-image composition. |
| `stickyFrame` | `stickyFrame` | `#sticky-frame` | The pinned/clipped viewport frame around the expanding image. |
| `imageBox` | `imageBox` | `#image-box` | The expanding image block whose absolute geometry changes through scroll. |
| `primaryImage` | `primaryImage` | `#hero-image` | The image/media surface inside `imageBox` that settles from an enlarged crop to its final scale. |

## Required Styles

### `scrollSource`

Selector: `.sticky-track`

```css
.sticky-track {
  position: relative;
  min-height: 400vh;
}
```

Reason: creates the runway needed for the full anchored-block-to-hero expansion.

### `stickyFrame`

Selector: `#sticky-frame`

```css
#sticky-frame {
  position: sticky;
  top: 0;
  height: 100vh;
  width: 100vw;
  overflow: clip;
}
```

Reason: pins and clips the expanding image composition inside the viewport.

### `imageBox`

Selector: `#image-box`

```css
#image-box {
  position: absolute;
  top: calc(60% - 24px);
  right: calc(75% - 24px);
  bottom: 24px;
  left: 24px;
  overflow: clip;
  will-change: top, right, bottom, left;
}
```

Reason: defines the anchored starting crop that expands across the sticky frame. Recompute these inset values from the actual section composition.

### `primaryImage`

Selector: `#hero-image`

```css
#hero-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  will-change: transform;
}
```

Reason: keeps the image/media surface itself filling the expanding block while the internal zoom settles back to `scale(1)`. Apply these dimensions on the `primaryImage` selector, not only on a descendant `img` tag.

## Interact Template

### Range

```ts
const RANGE = {
  rangeStart: { name: 'contain', offset: { value: 0, unit: 'percentage' } },
  rangeEnd: { name: 'contain', offset: { value: 100, unit: 'percentage' } },
  fill: 'both' as const,
};
```

### Image Box Expand Effect

```ts
const imageBoxExpandEffect = {
  key: 'imageBox',
  keyframeEffect: {
    name: 'manifest-expand-container',
    keyframes: [
      { top: 'calc(60% - 24px)', right: 'calc(75% - 24px)', offset: 0 },
      { top: 'calc(60% - 24px)', right: '24px', offset: 0.5 },
      { top: '24px', right: '24px', offset: 1 },
    ],
  },
  ...RANGE,
};
```

### Primary Image Zoom Effect

```ts
const primaryImageZoomEffect = {
  key: 'primaryImage',
  keyframeEffect: {
    name: 'manifest-expand-image-zoom-out',
    keyframes: [
      { transform: 'scale(1.25)', offset: 0 },
      { transform: 'scale(1)', offset: 1 },
    ],
  },
  ...RANGE,
};
```

### Interaction

```ts
{
  key: 'scrollSection',
  trigger: 'viewProgress',
  effects: [imageBoxExpandEffect, primaryImageZoomEffect],
}
```

## Source

This Markdown file was derived from [example.ts](/Users/marinebr/dev/responsive-editor-packages/packages/editor-package-ani-mate/src/examples/ManifestExpandScroll/example.ts).
