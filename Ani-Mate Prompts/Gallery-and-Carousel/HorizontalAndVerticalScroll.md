
# Horizontal And Vertical Scroll

Cards enter vertically into a sticky viewport frame, then the row pans horizontally.

## Summary

- **ID:** `horizontal-and-vertical-scroll`
- **Target shape:** Best for 3 or more sibling cards/images that can share one horizontal row inside a sticky viewport-height frame.
- **Description:** A sticky carousel sequence where cards rise into a clipped frame, then the full row pans sideways through the viewport.

## Demo HTML

```html
<section id="scroll-section" class="scroll-section">
  <div class="sticky-frame">
    <div id="horizontal-track" class="horizontal-track">
      <div id="card-1" class="card">1</div>
      <div id="card-2" class="card">2</div>
      <div id="card-3" class="card">3</div>
    </div>
  </div>
</section>
```

## Selector Contract

1. Role ownership is strict: `scrollSection` owns runway, `stickyFrame` owns sticky/clipping, `horizontalTrack` owns horizontal translateX, and `repeatedCard` owns vertical entry.
2. `scrollSection`, `stickyFrame`, and `horizontalTrack` must stay distinct. In Wix, `stickyFrame` is usually the internal-container-root and `horizontalTrack` is its `[data-testid="internal-container-content"]` child.
3. Cards are not sticky. Only the shared `stickyFrame` pins the scene, and only `horizontalTrack` pans sideways.
4. Use viewport units only for the runway and sticky frame. If cards use percentage heights, `horizontalTrack` must establish the composition height.
5. Compute horizontal pan from real overflow width. Three cards are the minimum useful pattern.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | The tall section whose `viewProgress` drives both the vertical entrances and horizontal pan. |
| `stickyFrame` | The shared sticky viewport frame that centers and clips the carousel while the section scrolls. |
| `horizontalTrack` | The flex row that contains repeated cards and receives the horizontal translateX effect. |
| `repeatedCard` | Cards/images in the horizontal row; each receives an individual vertical entrance effect. |

## Adaptation Notes

1. The source section does not need to already be a carousel; repeated siblings can be reorganized into a horizontal row with CSS.
2. Preserve the section root outer layout and keep card size relative to the sticky frame instead of converting cards to viewport-height blocks.
3. When cards use percentage heights, set `height: 100%` on `horizontalTrack` so those percentages resolve against a real stage height.
4. Cards should enter with stage-relative `translateY(...)` on the card roots, and the horizontal pan should start only after the row is already visible.
5. If the row does not overflow the frame, reduce or skip the horizontal pan instead of forcing a meaningless translateX.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollSection` | `scrollSource` | `.scroll-section` | The `viewProgress` source for the combined vertical-entry and horizontal-pan sequence. |
| `stickyFrame` | `stickyFrame` | `.sticky-frame` | The shared sticky frame that pins the row and clips cards while they enter and pan. |
| `horizontalTrack` | `horizontalTrack` | `#horizontal-track` | The moving row of cards; this element receives the horizontal translateX effect. |
| `card1` | `repeatedCard` | `.scroll-section #card-1` | Minimum repeated row card; extend for `card4..cardN`. |
| `card2` | `repeatedCard` | `.scroll-section #card-2` | Repeated row card. |
| `card3` | `repeatedCard` | `.scroll-section #card-3` | Repeated row card. |

> Repeated card keys must keep their trailing index (`card1`, `card2`, …) so they compact into the `card{n}` group; extend the row as `card4..cardN` for more items.

## Required Styles

### `scrollSource` — `.scroll-section`

```css
.scroll-section {
  position: relative;
  min-height: 700vh;
}
```

Reason: creates enough scroll distance for staged vertical entrances followed by horizontal pan.

### `stickyFrame` — `.sticky-frame`

```css
.sticky-frame {
  position: sticky;
  top: 12.5vh;
  height: 75vh;
  width: 100%;
  overflow: clip;
}
```

Reason: pins and clips the visible carousel frame; top should center the frame based on card height.

### `horizontalTrack` — `#horizontal-track`

```css
#horizontal-track {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 100%;
  width: max-content;
  gap: 4px;
  will-change: transform;
}
```

Reason: creates the row whose width exceeds the viewport and establishes a real composition height for percentage-sized cards.

### `repeatedCard` — `#horizontal-track > .card`

```css
#horizontal-track > .card {
  flex: 0 0 auto;
  width: auto;
  height: 75%;
  aspect-ratio: 4 / 5;
  transform: translateY(140%);
  will-change: transform;
  overflow: clip;
}
```

Reason: keep card size relative to the sticky frame instead of using viewport-height cards. Preserve the source aspect ratio (or measured width), size the card inside the frame, and start it just below that frame with a stage-relative translateY.

### `repeatedCard` — `.card`

```css
.card {
  margin: 0;
}
```

Reason: prevents default or inherited spacing from corrupting row width calculations.

## Suggested Controls

Expose the sideways pan distance and the row spacing; add more only when the adapted experience introduces new stable knobs.

### `pan-distance`

- **Label:** `Pan Distance`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `55`
- **Description:** How far the row pans sideways through the frame (magnitude of the negative translateX).
- **Constraints:** `min: 20`, `max: 80`, `step: 5`, `unit: %`
- **Binding:** `variable` `--hv-pan-distance` using template `${value}%`

### `card-gap`

- **Label:** `Card Gap`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `4`
- **Description:** Spacing between cards in the horizontal row.
- **Constraints:** `min: 0`, `max: 40`, `step: 2`, `unit: px`
- **Binding:** `variable` `--hv-card-gap` using template `${value}px`

## Interact Template

```ts
const RANGE = {
  easing: 'linear',
  fill: 'both' as const,
};
const ENTRY_RANGE_ENDS = [40, 50, 60] as const;

const verticalEntryEffect = (key: string, end: number) => ({
  key,
  keyframeEffect: {
    name: `${key}-vertical-entry`,
    keyframes: [
      { transform: 'translateY(125%)' },
      { transform: 'translateY(0)' },
    ],
  },
  rangeStart: { name: 'cover', offset: { unit: 'percentage', value: 10 } },
  rangeEnd: { name: 'cover', offset: { unit: 'percentage', value: end } },
  ...RANGE,
});

const horizontalTrackEffect = (endTranslate: string) => ({
  key: 'horizontalTrack',
  keyframeEffect: {
    name: 'horizontal-track-scroll',
    keyframes: [{ transform: 'translateX(0)' }, { transform: endTranslate }],
  },
  rangeStart: { name: 'cover', offset: { unit: 'percentage', value: 50 } },
  rangeEnd: { name: 'cover', offset: { unit: 'percentage', value: 90 } },
  ...RANGE,
});

const interaction = {
  key: 'scrollSection',
  trigger: 'viewProgress',
  effects: [
    horizontalTrackEffect('translateX(-55%)'),
    ...ENTRY_RANGE_ENDS.map((end, index) =>
      verticalEntryEffect(`card${index + 1}`, end),
    ),
  ],
};
```
