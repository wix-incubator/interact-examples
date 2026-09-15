# Card Fan

Stacked cards pivot from a shared point below to fan out like a hand of cards on scroll.

## Summary

- **ID:** `card-fan`
- **Target shape:** Best for 5–9 similarly sized sibling cards inside a single sticky stage, where the cards can overlap in one absolutely-positioned deck and rotate around a shared pivot below them.
- **Description:** Seven cards stacked at the center of the viewport rotate around a common pivot point beneath the deck, fanning symmetrically left and right as the section scrolls past.

## Demo HTML

```html
<div id="scroll-wrapper">
  <div class="sticky-container">
    <div class="deck">
      <div id="card-1" class="card"><img><div class="card-label">…</div></div>
      <div id="card-2" class="card"><img><div class="card-label">…</div></div>
      <div id="card-3" class="card"><img><div class="card-label">…</div></div>
      <div id="card-4" class="card"><img><div class="card-label">…</div></div>
      <div id="card-5" class="card"><img><div class="card-label">…</div></div>
      <div id="card-6" class="card"><img><div class="card-label">…</div></div>
      <div id="card-7" class="card"><img><div class="card-label">…</div></div>
    </div>
  </div>
</div>
```

## Selector Contract

1. Role ownership is strict: `scrollSource` owns the scroll runway, `stickyStage` owns sticky pinning and clipping, `collection` (the deck) owns the fixed card-sized coordinate box, and `repeatedCard` owns the absolute overlap, the shared pivot (`transform-origin`), and the fan rotation.
2. `stickyStage` and `collection` must be different selectors. The sticky stage is a full-viewport wrapper; the deck is a small card-sized box centered inside it. In Wix, `stickyStage` is the internal-container-root `#comp-...` and `collection` is its `[data-testid="internal-container-content"]` child.
3. Every `repeatedCard` must share the same `transform-origin` (a point below the deck) or the cards will not fan from a common pivot.
4. Cards are `position: absolute` and fully overlapped in the deck at rest — do not lay them out in a flex/grid row; the fan is created purely by rotation around the shared origin.
5. Keep the fan rotation on the card roots, not on `img` descendants, and use rendered `#comp-...` ids rather than `DESKTOP--...` ids.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | The tall wrapper (multiples of viewport height) that drives the `viewProgress` trigger. |
| `stickyStage` | A sticky viewport-height wrapper that centers and clips the deck while the source scrolls. |
| `collection` | A small card-sized, `position: relative` deck that establishes the shared coordinate box for the overlapped cards. |
| `repeatedCard` | Overlapped sibling cards that share a pivot below the deck and rotate to fan out symmetrically. |

## Adaptation Notes

1. Preserve the section-root outer layout; the sticky stage and centered deck are inner roles, not section-root roles.
2. The deck should match one card's dimensions; cards are absolutely positioned to fill it, so they all stack at the same spot before rotating.
3. Set `transform-origin` to a point below the card (e.g. `center 140%`) so rotation swings cards around a hand-of-cards pivot rather than spinning each in place. Deeper pivots produce shallower, wider arcs.
4. Fan angles are index-relative: for `CARDS` items with middle index `MID = floor(CARDS/2)`, each card's offset is `off = index - MID`; end angle is `off * spreadAngle` and start angle is `off * smallRestAngle`. Recompute both when item count changes instead of copying demo angles.
5. `z-index` should increase with card order so the fan layers cleanly; the demo assigns `#card-1..7` z-index `1..7`.
6. If outer cards rotate past the visible/clipped stage, reduce the spread angle or increase pivot depth before returning the result.
7. Reject the pattern if you cannot keep a distinct sticky stage and card-sized deck, or cannot give all cards one shared pivot.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollSection` | `scrollSource` | `#scroll-wrapper` | The `viewProgress` source for the whole pattern; owns the tall runway. |
| `stickyStage` | `stickyStage` | `.sticky-container` | Sticky pin + centering + clip: `position: sticky`, `100vh`, `overflow: clip`. Wix: `#comp-...` with `data-testid="internal-container-root"`, distinct from the deck. |
| `collection` | `collection` | `.deck` | Card-sized `position: relative` box that anchors the overlapped cards. Wix must be `#<stickyStageCompId> [data-testid="internal-container-content"]`, differing from `stickyStage`. |
| `card1` | `repeatedCard` | `#scroll-wrapper #card-1` | Minimum fan card; extend outward for `card8..cardN`. |
| `card2` | `repeatedCard` | `#scroll-wrapper #card-2` | Fan card. |
| `card3` | `repeatedCard` | `#scroll-wrapper #card-3` | Fan card. |
| `card4` | `repeatedCard` | `#scroll-wrapper #card-4` | Center card (no rotation at `off = 0`). |
| `card5` | `repeatedCard` | `#scroll-wrapper #card-5` | Fan card. |
| `card6` | `repeatedCard` | `#scroll-wrapper #card-6` | Fan card. |
| `card7` | `repeatedCard` | `#scroll-wrapper #card-7` | Fan card. |

> Repeated card keys must keep their trailing index (`card1`, `card2`, …) so they compact into the `card{n}` group; extend the row as `card8..cardN` for more items, and recompute each card's fan angle from its offset to the middle index.

## Required Styles

### `scrollSource` — `#scroll-wrapper`

```css
#scroll-wrapper {
  height: 600vh;
  position: relative;
}
```

Reason: creates enough scroll distance for the full `viewProgress` fan to play out; recompute proportionally with item count and desired pacing.

### `stickyStage` — `.sticky-container`

```css
.sticky-container {
  position: sticky;
  top: 0;
  height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: clip;
}
```

Reason: pins the deck to the viewport, centers it, and clips the fanning cards while the source section scrolls. Use `overflow: clip` (not `hidden`) to avoid breaking the ViewTimeline.

### `collection` — `.deck`

```css
.deck {
  position: relative;
  width: 280px;
  height: 400px;
}
```

Reason: establishes a single card-sized coordinate box; absolutely-positioned cards resolve against it and stack in the same spot before rotating.

### `repeatedCard` — `.deck > .card`

```css
.deck > .card {
  position: absolute;
  width: 280px;
  height: 400px;
  transform-origin: center 140%;
  will-change: transform;
}
```

Reason: overlaps all cards at one location and gives them a shared pivot below the deck so rotation fans them from a common point rather than spinning each in place.

## Suggested Controls

Always expose at least the spread angle; add pivot depth and scroll distance when the adapted section can safely support them.

### `spread-angle`

- **Label:** `Fan Spread`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `12`
- **Description:** Controls the per-step rotation between adjacent cards at full spread; larger values fan the cards wider.
- **Constraints:** `min: 4`, `max: 20`, `step: 1`, `unit: deg`
- **Binding:** `variable` `--fan-spread-step` using template `${value}deg`

### `pivot-depth`

- **Label:** `Pivot Depth`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `140`
- **Description:** Moves the shared rotation origin below the deck; deeper pivots create wider, shallower arcs.
- **Constraints:** `min: 100`, `max: 200`, `step: 5`, `unit: %`
- **Binding:** `style` `.deck > .card` `transform-origin` using template `center ${value}%`

### `scroll-distance`

- **Label:** `Scroll Distance`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `600`
- **Description:** Sets the runway height that paces how much scrolling drives the full fan.
- **Constraints:** `min: 300`, `max: 900`, `step: 50`, `unit: vh`
- **Binding:** `style` `#scroll-wrapper` `height` using template `${value}vh`

## Interact Template

```ts
const RANGE = {
  rangeStart: { name: 'contain', offset: { value: 0, unit: 'percentage' } },
  rangeEnd: { name: 'contain', offset: { value: 55, unit: 'percentage' } },
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  fill: 'both' as const,
};

// Recompute from real card count and spread — do not copy literal angles.
const CARDS = 7;
const SPREAD = 12;        // per-step degrees at full fan (bind to --fan-spread-step)
const REST = 0.8;         // per-step degrees at rest
const MID = Math.floor(CARDS / 2);

// Per-card fan effect: rotate from a small rest angle to the full offset angle
// around the shared transform-origin below the deck.
const fanEffect = (index: number) => {
  const off = index - MID;
  return {
    key: `card${index + 1}`,
    keyframeEffect: {
      name: `fan-${index + 1}`,
      keyframes: [
        { transform: `rotate(${off * REST}deg)` },
        { transform: `rotate(${off * SPREAD}deg)` },
      ],
    },
    ...RANGE,
  };
};

const interaction = {
  key: 'scrollSection',
  trigger: 'viewProgress',
  effects: Array.from({ length: CARDS }, (_, i) => fanEffect(i)),
};
```