# Scroll 3D Animation

Split-screen copy with a rotating 3D panel stack that subtly fans out on scroll.

## Summary

- **ID:** `scroll-3d-animation`
- **Target shape:** Best for one tall scroll section with fixed intro copy on one side and `4-8` overlapped image/card panels centered in a separate 3D stage.
- **Description:** A fixed panel stage starts turned away in 3D, rotates toward the viewer over the first half of the scroll, and keeps a stack of depth-layered panels centered while each panel drifts slightly sideways according to its index.

## Demo HTML

```html
<section class="intro">
  <div class="text-block">
    <h1>Title 01</h1>
    <p>Scroll-driven 3D animation with horizontal subtle movement.</p>
  </div>

  <div class="panel-wrapper">
    <div class="panel" id="panel-0"><img src="..." alt="Panel 1"></div>
    <div class="panel" id="panel-1"><img src="..." alt="Panel 2"></div>
    <div class="panel" id="panel-2"><img src="..." alt="Panel 3"></div>
    <div class="panel" id="panel-3"><img src="..." alt="Panel 4"></div>
    <div class="panel" id="panel-4"><img src="..." alt="Panel 5"></div>
    <div class="panel" id="panel-5"><img src="..." alt="Panel 6"></div>
    <div class="panel" id="panel-6"><img src="..." alt="Panel 7"></div>
  </div>
</section>
```

## Selector Contract

1. Role ownership is strict: `scrollSection` owns the tall runway, `copyBlock` owns the fixed text column, `panelStage` owns the shared 3D rotation, and each `repeatedPanel` owns its own size, depth, and subtle horizontal drift.
2. Keep `copyBlock` and `panelStage` as separate fixed siblings inside the same scroll section. Do not wrap the text into the rotating 3D stage.
3. Only `panelStage` receives the `rotateY(...)` reveal. Individual panels keep their own centered transform plus per-item scale and horizontal drift.
4. Depth belongs on the repeated panel roots via `translateZ(...)` or the CSS `translate` longhand. Do not fake the stack by offsetting margins or rotating the whole section.
5. On narrow screens, collapse to a static stacked column and remove the motion. The source example disables the animation at `max-width: 1280px`.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | The tall section whose `viewProgress` drives the wrapper reveal and all per-panel drift effects. |
| `copyBlock` | Fixed left-side copy that stays readable and does not rotate with the 3D stage. |
| `panelStage` | Fixed right-side perspective container that stays centered and owns the shared `rotateY` reveal. |
| `repeatedPanel` | Overlapped image/card panels centered in the stage; each keeps its own size, scale, and z-depth. |

## Adaptation Notes

1. Preserve the split layout when the section already has one text column and one visual column. This pattern depends on the text remaining still while the panel stack rotates independently.
2. Recompute panel size, scale, and z-depth from the real item count instead of copying the demo numbers literally. The source ramps panel width from roughly `45vw` to `65vw`, height from `30vw` to `42vw`, and scale from `0.75` to `1.15`.
3. Keep all panels anchored to the same center point with `left: 50%` plus `translateX(-50%)`; vary only depth and small horizontal drift.
4. If the source section uses cards instead of pure images, animate the card root and keep media filling that root with `width/height: 100%` and `object-fit: cover`.
5. If there is no real split layout, this pattern can still work with centered copy above the stage, but the fixed-copy/sidebar feel is part of the original example and should be preserved when possible.
6. For reduced motion or small screens, fall back to a normal vertical list of panels and skip the interaction entirely rather than forcing a broken 3D layout.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollSection` | `scrollSource` | `.intro` | The `viewProgress` source for the whole sequence. |
| `copyBlock` | `copyBlock` | `.text-block` | Fixed text column that stays outside the animated 3D stage. |
| `panelStage` | `panelStage` | `.panel-wrapper` | Shared perspective container that rotates from `-180deg` to `0deg`. |
| `panel1` | `repeatedPanel` | `.panel-wrapper #panel-0` | Repeated centered panel; extend as `panel4..panelN`. |
| `panel2` | `repeatedPanel` | `.panel-wrapper #panel-1` | Repeated centered panel. |
| `panel3` | `repeatedPanel` | `.panel-wrapper #panel-2` | Repeated centered panel. |
| `panel4` | `repeatedPanel` | `.panel-wrapper #panel-3` | Repeated centered panel. |

> Repeated panel keys should keep their trailing index (`panel1`, `panel2`, …) even if the DOM ids start at `panel-0`; extend the pattern through `panelN` for more items.

## Required Styles

### `scrollSource` — `.intro`

```css
.intro {
  position: relative;
  min-height: 300vh;
  padding: 20px;
}
```

Reason: creates the full scroll runway for the wrapper reveal and the scrubbed panel drift.

### `copyBlock` — `.text-block`

```css
.text-block {
  position: fixed;
  top: 50%;
  left: 3%;
  z-index: 10;
  width: 18%;
  min-width: 200px;
  transform: translateY(-50%);
}
```

Reason: keeps the copy readable and stationary while the 3D panel stage animates beside it.

### `panelStage` — `.panel-wrapper`

```css
.panel-wrapper {
  position: fixed;
  top: 50%;
  left: calc(3% + 18% + 1%);
  width: calc(100% - (3% + 18% + 4%));
  display: flex;
  justify-content: center;
  align-items: center;
  perspective: var(--panel-perspective, 2000px);
  transform: translateY(-50%);
  transform-style: preserve-3d;
}
```

Reason: creates the shared fixed 3D viewport and supplies the exact transform baseline the wrapper reveal animates on top of.

### `repeatedPanel` — `.panel-wrapper > .panel`

```css
.panel-wrapper > .panel {
  position: absolute;
  left: 50%;
  width: var(--panel-width, 45vw);
  height: var(--panel-height, 30vw);
  transform: translateX(-50%) scale(var(--panel-scale, 1));
  translate: 0 0 var(--panel-z, 0px);
  transform-origin: center center;
  transform-style: preserve-3d;
  will-change: transform, translate;
}
```

Reason: centers every repeated panel on the same anchor while allowing per-panel size, scale, and z-depth to vary independently.

### `repeatedPanel` — `.panel-wrapper > .panel > img`

```css
.panel-wrapper > .panel > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

Reason: makes image panels fill the animated card root without introducing inner layout drift.

## Suggested Controls

Expose the stack spacing and the per-panel horizontal spread first; they are the most stable knobs in the source pattern.

### `panel-gap`

- **Label:** `Panel Gap`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `120`
- **Description:** Distance in pixels between successive panels on the z-axis.
- **Constraints:** `min: 40`, `max: 220`, `step: 10`, `unit: px`
- **Binding:** `variable` `--panel-gap` using a direct value

### `panel-drift`

- **Label:** `Panel Drift`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `20`
- **Description:** Horizontal drift per panel index by the end of the scroll.
- **Constraints:** `min: 0`, `max: 60`, `step: 2`, `unit: px`
- **Binding:** `variable` `--panel-drift` using template `${value}px`

### `stage-perspective`

- **Label:** `Perspective`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `2000`
- **Description:** Depth strength for the shared 3D stage.
- **Constraints:** `min: 800`, `max: 3000`, `step: 100`, `unit: px`
- **Binding:** `variable` `--panel-perspective` using template `${value}px`

## Interact Template

```ts
const FULL_RANGE = {
  rangeStart: { name: 'cover', offset: { unit: 'percentage', value: 0 } },
  rangeEnd: { name: 'cover', offset: { unit: 'percentage', value: 100 } },
  easing: 'linear',
  fill: 'both' as const,
};

const configurePanelLayout = (panel: HTMLElement, index: number, count: number) => {
  const progress = count > 1 ? index / (count - 1) : 1;
  panel.style.setProperty('--panel-width', `${45 + progress * 20}vw`);
  panel.style.setProperty('--panel-height', `${30 + progress * 12}vw`);
  panel.style.setProperty('--panel-scale', `${0.75 + progress * 0.4}`);
  panel.style.setProperty('--panel-z', `calc(var(--panel-gap) * ${-index} * 1px)`);
};

const wrapperReveal = {
  key: 'panelStage',
  keyframeEffect: {
    name: 'panel-stage-rotate-in',
    keyframes: [
      { transform: 'translateY(-50%) rotateY(-180deg)' },
      { transform: 'translateY(-50%) rotateY(0deg)' },
    ],
  },
  rangeStart: { name: 'cover', offset: { unit: 'percentage', value: 0 } },
  rangeEnd: { name: 'cover', offset: { unit: 'percentage', value: 50 } },
  easing: 'ease-out',
  fill: 'both' as const,
};

const panelDriftEffect = (key: string, index: number, count: number) => {
  const progress = count > 1 ? index / (count - 1) : 1;
  const scale = 0.75 + progress * 0.4;
  const xEnd = (index - (count - 1) / 2) * 20;

  return {
    key,
    keyframeEffect: {
      name: `${key}-drift`,
      keyframes: [
        { transform: `translateX(-50%) translateX(0px) scale(${scale})` },
        { transform: `translateX(-50%) translateX(${xEnd}px) scale(${scale})` },
      ],
    },
    ...FULL_RANGE,
  };
};

const interaction = {
  key: 'scrollSection',
  trigger: 'viewProgress',
  effects: [
    wrapperReveal,
    ...Array.from({ length: panelCount }, (_, index) =>
      panelDriftEffect(`panel${index + 1}`, index, panelCount),
    ),
  ],
};
```

## Source

Derived from [`Scroll_3D_Animation.html`](https://github.com/wix-incubator/interact-examples/blob/main/Gallery-and-Carousel/Scroll_3D_Animation.html).
