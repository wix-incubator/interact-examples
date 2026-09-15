# Card Spread

Stacked cards fan out horizontally on scroll.

## Summary

- **ID:** `card-spread`
- **Target shape:** Best for 3–7 similarly sized sibling items inside a single sticky stage, including mixed-content wrappers where the cards can share one overlapped grid row.
- **Description:** Five cards stacked at the center of the viewport fan out left/right and shrink slightly as the section scrolls past.

## Demo HTML

```html
<section class="scroll-section">
  <div class="cards-container-wrapper">
    <div id="cards-collection">
      <h2 class="static-title">Title</h2>
      <div id="card-1" class="card">1</div>
      <div id="card-2" class="card">2</div>
      <div id="card-3" class="card">3</div>
      <div id="card-4" class="card">4</div>
      <div id="card-5" class="card">5</div>
    </div>
  </div>
</section>
```

## Selector Contract

1. Role ownership is strict: `scrollSection` owns the timeline, `stickyStage` owns sticky/clipping, `collection` owns the centered inner stage, and `repeatedCard` owns the overlapped card-stage layout plus spread transform.
2. `stickyStage` and `collection` must be different selectors. In Wix, `stickyStage` is the internal-container-root `#comp-...` with `data-testid="internal-container-root"` and `collection` is its `[data-testid="internal-container-content"]` child.
3. If `collection` also contains non-repeated siblings such as titles or copy, keep `collection` as a grid and overlap only the repeated cards in a shared card stage row. Do not convert the whole mixed wrapper to flex.
4. Keep card-spread layout styles on the repeated card roots, not on raw `img` descendants or broad selectors when concrete card component ids exist.
5. Repeated cards share one overlapped stage inside the collection, not sticky items. Use rendered `#comp-...` ids, not `DESKTOP--...` ids.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | The tall section that drives the `viewProgress` trigger. |
| `stickyStage` | A sticky viewport-height wrapper that keeps the cards pinned during scroll. |
| `collection` | The grid layout owner that can keep static siblings in flow while repeated cards share one overlapped card stage. |
| `repeatedCard` | Repeated sibling items that share one overlapped grid cell and then spread horizontally. |

## Adaptation Notes

1. Preserve the section root outer layout; the sticky stage and centered collection are inner roles, not section-root roles.
2. Use viewport units only for the outer timeline container and sticky stage. Size cards relative to the collection stage so their proportions stay close to the source composition.
3. If `collection` contains a title or other static siblings, leave them in their own normal grid row and place only the repeated cards into a shared lower grid row so the non-animated content stays untouched.
4. Animate spread with `translateX(...) scale(...)` on the card roots instead of resizing card height unless the real section truly depends on viewport-sized cards.
5. When item count changes, recompute width, spacing, and outer translation distances instead of copying the demo offsets literally.
6. If the outer cards land mostly outside the visible stage, reduce card width or spread distance before returning the result.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollSection` | `scrollSource` | `.scroll-section` | The `viewProgress` source for the entire pattern. |
| `stickyStage` | `stickyStage` | `.cards-container-wrapper` | Sticky pin only: `position: sticky`, `100vh`, `overflow: clip`. Wix: `#comp-...` with `data-testid="internal-container-root"` — not the collection. |
| `collection` | `collection` | `#cards-collection` | Centered mixed-content stage for the spread. Wix: `#<stickyStageCompId> [data-testid="internal-container-content"]` — must differ from `stickyStage`. |
| `card1` | `repeatedCard` | `.scroll-section #card-1` | Minimum repeated spread card; extend outward for `card4..cardN`. |
| `card2` | `repeatedCard` | `.scroll-section #card-2` | Repeated spread card. |
| `card3` | `repeatedCard` | `.scroll-section #card-3` | Repeated spread card. |
| `card4` | `repeatedCard` | `.scroll-section #card-4` | Repeated spread card. |
| `card5` | `repeatedCard` | `.scroll-section #card-5` | Repeated spread card. |

> Repeated card keys must keep their trailing index (`card1`, `card2`, …) so they compact into the `card{n}` group; extend the row as `card4..cardN` for more items.

## Required Styles

### `scrollSource` — `.scroll-section`

```css
.scroll-section {
  height: 400vh;
}
```

Reason: creates enough scroll distance for the full `viewProgress` spread to play out.

### `stickyStage` — `.cards-container-wrapper`

```css
.cards-container-wrapper {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: clip;
}
```

Reason: pins the stage to the viewport and clips the spreading cards while the source section scrolls.

### `collection` — `#cards-collection`

```css
#cards-collection {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr;
  width: 100%;
  height: 100vh;
  margin: 0 auto;
  justify-items: center;
}
```

Reason: creates a mixed-content grid stage so static siblings stay in flow while repeated cards overlap in a shared card row. The collection owns the composition space; child card percentages resolve against this stage.

### `repeatedCard` — `#cards-collection > .card`

```css
#cards-collection > .card {
  grid-column: 1;
  grid-row: 2;
  place-self: start center;
  width: 20vw;
  height: 55%;
  transform-origin: center center;
  will-change: transform;
}
```

Reason: overlaps repeated cards in one shared grid cell with top alignment and centered placement before the animation distributes them, preserving their proportion relative to the collection stage.

### `repeatedCard` — `.card`

```css
.card {
  margin: 0;
}
```

Reason: prevents repeated cards from drifting apart because of default spacing.

## Suggested Controls

Always expose at least the spread distance and ending scale; add more only when the adapted experience introduces new stable knobs.

### `spread`

- **Label:** `Spread`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `40`
- **Description:** Controls how far the outer cards fan out from the center stage at the end of the scroll range.
- **Constraints:** `min: 20`, `max: 50`, `step: 2`, `unit: vw`
- **Suggested variable:** `--card-spread-unit`

### `end-scale`

- **Label:** `Card Scale`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `0.85`
- **Description:** Controls the ending scale of the cards at maximum spread.
- **Constraints:** `min: 0.7`, `max: 1`, `step: 0.01`, `unit: x`
- **Suggested variable:** `--card-end-scale`

## Interact Template

```ts
const RANGE = {
  rangeStart: { name: 'cover', offset: { unit: 'percentage', value: 20 } },
  rangeEnd: { name: 'cover', offset: { unit: 'percentage', value: 80 } },
  easing: 'cubic-bezier(0.42, 0, 0.58, 1)',
  fill: 'both' as const,
};

// Demo offsets for five cards — recompute from real item count and spread.
const SPREAD_TRANSLATIONS = ['-40vw', '-20vw', '0', '20vw', '40vw'] as const;

// Combined per-card effect: translateX + scale shrink in a single keyframe pair.
const cardSpreadEffect = (key: string, endTranslate: string) => ({
  key,
  keyframeEffect: {
    name: `${key}-spread`,
    keyframes: [
      { transform: 'translateX(0) scale(1)' },
      { transform: `${endTranslate} scale(0.85)` },
    ],
  },
  ...RANGE,
});

const interaction = {
  key: 'scrollSection',
  trigger: 'viewProgress',
  effects: SPREAD_TRANSLATIONS.map((translate, index) =>
    cardSpreadEffect(`card${index + 1}`, `translateX(${translate})`),
  ),
};
```
