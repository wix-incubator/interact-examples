# Horizontal Lanes

Multiple rows of items scroll sideways forever at different speeds and directions.

## Summary

- **ID:** `horizontal-lanes`
- **Target shape:** Best for 2–5 stacked rows of similarly sized items (image strips, logo walls, card marquees) that should drift horizontally on a loop while in view.
- **Description:** Each lane clips an over-wide track holding two identical copies of its items; the track loops between `translateX(0)` and `translateX(-50%)` continuously, so items scroll past seamlessly. Odd lanes drift one way, even lanes the other, each at its own speed.

## Demo HTML

```html
<div class="gallery-container">
  <!-- one lane: clipping row (viewEnter source) + moving track (effect target) -->
  <div class="gallery-row" id="lane-1">
    <div class="animation-wrapper" id="wrapper-1">
      <div><!-- set A -->
        <div class="image-container"><img class="gallery-image" src="…"><div class="image-title">…</div></div>
        <div class="image-container"><img class="gallery-image" src="…"><div class="image-title">…</div></div>
        <!-- … more items … -->
      </div>
      <div><!-- set B — IDENTICAL copy of set A, same items, same order -->
        <!-- … same items … -->
      </div>
    </div>
  </div>
  <!-- lane-2 / wrapper-2, lane-3 / wrapper-3, … -->
</div>
```

## Selector Contract

1. Role ownership is strict: each `marqueeLane` owns the `viewEnter` source plus the clipping; each `marqueeTrack` owns the slide transform; `trackHalf` owns the duplicated-set structure; `laneItem` owns item sizing.
2. The track MUST contain exactly **two** identical content sets (`trackHalf` × 2, same items in the same order). The `translateX(-50%)` loop assumes the track is exactly two sets wide — one set shows a gap, three or more breaks the 50% math.
3. The `viewEnter` source and the animated target must be **different** elements: source is the lane (`lane{n}`), target is the track (`track{n}`). The raw demo animates the track as its own source with `type: 'state'`; per `@wix/interact` that risks re-trigger/never-firing, so map the source to the lane instead.
4. The track must be `width: max-content` inside an `overflow: hidden` lane, so it can exceed the lane and be clipped. Use rendered ids/classes, not invented ones.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `marqueeLane` | A fixed-height row that clips its track and acts as the `viewEnter` source so the loop only runs while on screen. |
| `marqueeTrack` | The over-wide flex row that actually moves; `width: max-content`, animated on `transform`. The effect target. |
| `trackHalf` | One of the two identical content sets inside the track; the duplication is what makes the `-50%` loop seamless. |
| `laneItem` | A repeated item carried by the track; keeps its own width and never shrinks. |

## Adaptation Notes

1. Render each lane's items **twice**, in order, as two `trackHalf` children — the loop math (`translateX(0) ↔ translateX(-50%)`) depends on the track being exactly two sets wide.
2. Direction alternates by lane parity: odd lanes `[-50% → 0]` (drift right), even lanes `[0 → -50%]` (drift left). Set each track's CSS initial `transform` to match its first keyframe so there's no jump before the loop starts.
3. Speed is `trackWidth / duration`. The illustrative 40–55s are tuned to the demo's set width; when item count or size changes, scale each lane's `duration` proportionally to keep a constant pixels-per-second, and keep durations slightly different per lane for a natural multi-speed feel.
4. `@wix/interact` runs in JSON, which has no `Infinity` — serialize the endless loop as `iterations: 0` (treated as infinite). The TS template below writes `Infinity` only for readability.
5. Keep `viewEnter` with `type: 'state'` (plays while the lane is visible, pauses off-screen) — do not switch to `once`, which would stop the marquee after the first entry. To add lanes, extend `lane4..laneN` + `track4..trackN` as pairs; hiding the lower lanes under a mobile breakpoint is optional.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `lane1` | `marqueeLane` | `#lane-1` (`.gallery-row`) | `viewEnter` source + clip for track 1; extend outward for `lane4..laneN`. |
| `lane2` | `marqueeLane` | `#lane-2` (`.gallery-row`) | `viewEnter` source + clip for track 2. |
| `lane3` | `marqueeLane` | `#lane-3` (`.gallery-row`) | `viewEnter` source + clip for track 3. |
| `track1` | `marqueeTrack` | `#wrapper-1` | Moving flex track (two duplicated sets); marquee target for lane 1. |
| `track2` | `marqueeTrack` | `#wrapper-2` | Marquee target for lane 2. |
| `track3` | `marqueeTrack` | `#wrapper-3` | Marquee target for lane 3. |

> Repeated keys keep their trailing index and are paired: `lane{n}` is the source for `track{n}`. Extend the rows together as matched `lane4`+`track4` … `laneN`+`trackN` pairs.

## Required Styles

### `marqueeLane` — `.gallery-row`

```css
.gallery-row {
  height: var(--row-height, 240px);
  position: relative;
  overflow: hidden;
}
```

Reason: a fixed-height lane that clips the wider moving track so only one lane's worth of items shows at a time.

### `marqueeTrack` — `.animation-wrapper`

```css
.animation-wrapper {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: max-content;
  will-change: transform;
}
```

Reason: a single horizontal row sized to its full content so it can slide left/right and be clipped by the lane; `will-change` hints compositing for the perpetual transform.

### `trackHalf` — `.animation-wrapper > div`

```css
.animation-wrapper > div {
  display: flex;
  flex-direction: row;
  height: 100%;
}
```

Reason: the two identical sets sit side-by-side so a `-50%` shift equals exactly one set width — the moment the first set scrolls out, the second is in the same place, making the loop seamless.

### `laneItem` — `.image-container`

```css
.image-container {
  position: relative;
  height: 100%;
  flex-shrink: 0;
}
```

Reason: items keep their natural width and never compress, so the track's total width (and therefore the loop distance) stays stable.

### `laneItem` — `.gallery-image`

```css
.gallery-image {
  height: 100%;
  width: auto;
  object-fit: cover;
  box-sizing: border-box;
  padding: var(--img-padding, 15px);
  border-radius: var(--img-border-radius, 24px);
  display: block;
}
```

Reason: images size to the lane height and keep their aspect ratio, which sets each item's width (hence the track width); the padding creates the visible gap between items.

## Suggested Controls

Expose the loop speed and the lane height as the core knobs; item padding is a secondary spacing knob.

### `speed`

- **Label:** `Scroll Speed`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `45`
- **Description:** How long one full loop takes; lower is faster. Applied as each lane's effect duration (vary slightly per lane).
- **Constraints:** `min: 15`, `max: 90`, `step: 1`, `unit: s`
- **Suggested variable:** `--marquee-duration`

### `row-height`

- **Label:** `Lane Height`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `240`
- **Description:** Height of each lane, which also scales the items (they size to lane height).
- **Constraints:** `min: 120`, `max: 420`, `step: 10`, `unit: px`
- **Suggested variable:** `--row-height`

### `item-padding`

- **Label:** `Item Gap`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `15`
- **Description:** Padding around each item — the visible gap between items in a lane.
- **Constraints:** `min: 0`, `max: 40`, `step: 1`, `unit: px`
- **Suggested variable:** `--img-padding`

## Interact Template

```ts
// viewEnter `state` plays the marquee while the lane is on screen and pauses it
// when the lane scrolls away (cheap off-screen). Source = lane, target = track,
// so source and target are different elements (see Selector Contract #3).

// Two seamless directions. The track holds TWO identical sets, so a -50% shift
// equals exactly one set width.
const moveRight = [{ transform: 'translateX(-50%)' }, { transform: 'translateX(0)' }];
const moveLeft = [{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }];

// Illustrative per-lane durations (ms). Recompute from real track width to hold
// a constant pixels/second; keep them slightly different per lane.
const LANE_DURATIONS = [40000, 50000, 45000];
```

```ts
// One marquee effect per lane. Direction alternates by index parity.
// NOTE: in serialized JSON use `iterations: 0` (treated as infinite) — JSON has
// no `Infinity`.
const marqueeEffect = (trackKey: string, index: number) => ({
  key: trackKey,
  keyframeEffect: {
    name: `${trackKey}-marquee`,
    keyframes: index % 2 === 0 ? moveRight : moveLeft,
  },
  duration: LANE_DURATIONS[index] ?? 45000,
  easing: 'linear',
  iterations: Infinity, // serialize as 0
});

const laneKeys = ['lane1', 'lane2', 'lane3'] as const;
const trackKeys = ['track1', 'track2', 'track3'] as const;

// Each lane is its own viewEnter(state) source driving only its own track.
const interactions = laneKeys.map((laneKey, i) => ({
  key: laneKey,
  trigger: 'viewEnter',
  params: { type: 'state' },
  effects: [marqueeEffect(trackKeys[i], i)],
}));
```
