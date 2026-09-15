# Card Spread

Stacked cards fan out horizontally on scroll.

## Summary

- **ID:** `card-spread`
- **Target shape:** Best for **3+ similarly sized sibling image cards** stacked inside a single sticky stage. A title or short copy may sit alongside the cards, but there must still be **3+ real, comparably sized cards** to spread.
- **Not for:** Two-item sections, text+button pairs, or any layout where the only "siblings" are dissimilar wrappers (e.g. one image + one text/button block). There is nothing to fan out there — reject the pattern instead of forcing arbitrary siblings to translate.
- **Description:** Cards stacked at the center of the viewport fan out left/right and shrink slightly as the section scrolls past.

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

1. Role ownership is strict: `scrollSection` owns runway, `stickyStage` owns sticky/clipping, `collection` owns the centered inner stage, and `repeatedCard` owns the overlapped card-stage layout plus spread transform.
2. `stickyStage` and `collection` must be **different selectors** — never collapse them into a single `stage` key. In Wix, `stickyStage` is the internal-container-root `#comp-...` and `collection` is its `[data-testid="internal-container-content"]` child. If you cannot resolve two distinct selectors, reject the pattern.
3. If `collection` also contains non-repeated siblings such as titles or copy, keep `collection` as a grid and overlap only the repeated cards in a shared card stage row. Do not convert the whole mixed wrapper to flex.
4. Keep card-spread layout styles on the repeated card roots, not on raw `img` descendants or broad selectors when concrete card component ids exist.
5. Repeated cards share one overlapped stage inside the collection, not sticky items. Use rendered `#comp-...` ids, not `DESKTOP--...` ids.
6. The elements you pick as `repeatedCard` must be the visible, centered content of a valid stage. If translating/hiding them would leave the sticky stage blank (no centered content ever renders), the selectors are wrong — reject rather than ship a blank frame.
7. Require **at least 3** `repeatedCard` selectors that are comparably sized. Fewer than 3, or mixed image/text wrappers, means the pattern does not apply.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | The tall section that drives the `viewProgress` trigger. |
| `stickyStage` | A sticky viewport-height wrapper that keeps the cards pinned during scroll. Distinct from `collection`. |
| `collection` | The grid layout owner that can keep static siblings in flow while repeated cards share one overlapped card stage. Distinct from `stickyStage`. |
| `repeatedCard` | 3+ comparably sized repeated sibling items that share one overlapped grid cell and then spread horizontally. |

## Adaptation Notes

1. Preserve the section root outer layout; the sticky stage and centered collection are inner roles, not section-root roles.
2. Use viewport units only for the outer runway and sticky stage. Size cards relative to the collection stage so their proportions stay close to the source composition.
3. If `collection` contains a title or other static siblings, leave them in their own normal grid row and place only the repeated cards into a shared lower grid row so the non-animated content stays untouched.
4. Animate spread with `translateX(...) scale(...)` on the card roots instead of resizing card height unless the real section truly depends on viewport-sized cards.
5. **Recompute translations from item count.** Center the stack and give card `i` (0-indexed, `N` cards total) a final translation of `unit * (i - (N - 1) / 2)`, where `unit` is the center-to-center gap in `vw`. Never copy the demo's five-card offsets literally.
6. **Size `unit` and `cardWidth` (both in vw) against two hard constraints:**
   - *Separation:* `unit > cardWidth`, so adjacent cards — and their per-item labels/numbers — actually clear each other at full spread (edge gap `= unit - cardWidth > 0`).
   - *Containment:* the outermost card must stay on the clipped stage: `((N - 1) / 2) * unit + cardWidth / 2 ≤ ~48`.
   - These are only jointly satisfiable when the deck is narrow enough: aim for `N * cardWidth < ~90vw` (roughly `cardWidth ≤ 90 / N`). If the source cards are too wide (e.g. 6 × 15vw = 90vw), shrink `cardWidth` first, then pick `unit` in the window `(cardWidth, (96 - cardWidth) / (N - 1)]`.
7. **Reject the pattern** when any of these hold: fewer than 3 comparably sized cards; the "siblings" are dissimilar (one image + one text/button wrapper, or a single hero); no distinct sticky-stage vs. collection selectors; or the chosen movers would not leave centered content visible on the stage. Do not force a title, lone image, or button to spread.
8. **Verify visibility before returning.** After computing the layout, confirm the correct elements move and stay on-stage at both progress `0` and `1` — no blank frame, no cards clipped at both viewport edges, no items still overlapping at full spread.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollSection` | `scrollSource` | `.scroll-section` | The `viewProgress` source for the entire pattern. |
| `stickyStage` | `stickyStage` | `.cards-container-wrapper` | Sticky pin only: `position: sticky`, `100vh`, `overflow: clip`. Wix: `#comp-...` with `data-testid="internal-container-root"` and not the collection. |
| `collection` | `collection` | `#cards-collection` | Centered mixed-content stage for the spread. Wix must be `#<stickyStageCompId> [data-testid="internal-container-content"]`, which must differ from `stickyStage`. |
| `card1` | `repeatedCard` | `.scroll-section #card-1` | Minimum repeated spread card; extend outward for `card4..cardN`. |
| `card2` | `repeatedCard` | `.scroll-section #card-2` | Repeated spread card. |
| `card3` | `repeatedCard` | `.scroll-section #card-3` | Repeated spread card (minimum viable count). |
| `card4` | `repeatedCard` | `.scroll-section #card-4` | Repeated spread card (optional). |
| `card5` | `repeatedCard` | `.scroll-section #card-5` | Repeated spread card (optional). |

> Repeated card keys must keep their trailing index (`card1`, `card2`, …) so they compact into the `card{n}` group; extend the row as `card4..cardN` for more items. At least `card1..card3` must resolve to real, comparably sized cards or the pattern is rejected.

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
  /* Keep the deck narrow enough that N * width < ~90vw
     (roughly width <= 90 / N) so spread can both separate and stay on-stage. */
  width: 20vw;
  height: 55%;
  transform-origin: center center;
  will-change: transform;
}
```

Reason: overlaps repeated cards in one shared grid cell with top alignment and centered placement before the animation distributes them, preserving their proportion relative to the collection stage. Width must be recomputed from item count so the spread constraints in Adaptation Note 6 are satisfiable.

### `repeatedCard` — `.card`

```css
.card {
  margin: 0;
}
```

Reason: prevents repeated cards from drifting apart because of default spacing.

## Suggested Controls

Always expose at least the spread distance and ending scale; add more only when the adapted experience introduces new stable knobs. Note that the default `spread` value must be re-derived per section from item count and card width (Adaptation Note 6), not shipped blindly.

### `spread`

- **Label:** `Spread`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `20`
- **Description:** Center-to-center gap (in vw) between adjacent cards at the end of the scroll range. Must exceed card width so cards separate, and stay small enough that outer cards remain on the clipped stage.
- **Constraints:** `min: 8`, `max: 40`, `step: 1`, `unit: vw`
- **Binding:** `variable` `--card-spread-unit` using template `${value}vw`

### `end-scale`

- **Label:** `Card Scale`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `0.85`
- **Description:** Controls the ending scale of the cards at maximum spread.
- **Constraints:** `min: 0.7`, `max: 1`, `step: 0.01`, `unit: x`
- **Binding:** `variable` `--card-end-scale` using a direct value

## Interact Template

```ts
const RANGE = {
  rangeStart: { name: 'cover', offset: { unit: 'percentage', value: 20 } },
  rangeEnd: { name: 'cover', offset: { unit: 'percentage', value: 80 } },
  easing: 'cubic-bezier(0.42, 0, 0.58, 1)',
  fill: 'both' as const,
};

// Derive translations from the REAL item count — never hardcode demo offsets.
// unit = center-to-center gap in vw (bind to --card-spread-unit).
// Constraints (see Adaptation Note 6), with cardWidth in vw:
//   separation: unit > cardWidth
//   containment: ((N - 1) / 2) * unit + cardWidth / 2 <= ~48
const N = 5;          // number of resolved repeatedCard selectors (>= 3)
const UNIT = 20;      // vw, recomputed per section
const END_SCALE = 0.85;

const spreadTranslation = (index: number) =>
  `${UNIT * (index - (N - 1) / 2)}vw`;

// Combined per-card effect: translateX + scale shrink in a single keyframe pair.
const cardSpreadEffect = (key: string, endTranslate: string) => ({
  key,
  keyframeEffect: {
    name: `${key}-spread`,
    keyframes: [
      { transform: 'translateX(0) scale(1)' },
      { transform: `translateX(${endTranslate}) scale(${END_SCALE})` },
    ],
  },
  ...RANGE,
});

const interaction = {
  key: 'scrollSection',
  trigger: 'viewProgress',
  effects: Array.from({ length: N }, (_, index) =>
    cardSpreadEffect(`card${index + 1}`, spreadTranslation(index)),
  ),
};
```