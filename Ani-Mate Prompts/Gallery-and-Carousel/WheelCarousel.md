# Top-Arc Wheel Carousel

Image cards ride a slowly spinning wheel while staying upright, with only the top arc revealed.

## Summary

- **ID:** `wheel-carousel`
- **Target shape:** Best for a gallery of 8–12 similarly sized square images that can share one circular stage inside a clipping frame; suits hero or promo sections where only the top arc of the wheel is visible above copy.
- **Description:** A dozen image cards are positioned around a circle on a wheel that rotates continuously; each card counter-rotates to stay upright, the frame clips everything but the top arc, and hovering a card zooms its image.

## Demo HTML

```html
<section class="arc-viewport">
  <div id="wheel" class="wheel">
    <div id="card-1" class="card"><img id="card-1-img" src="…" alt="" /></div>
    <div id="card-2" class="card"><img id="card-2-img" src="…" alt="" /></div>
    <div id="card-3" class="card"><img id="card-3-img" src="…" alt="" /></div>
    <!-- card-4 … card-12, same structure -->
  </div>
  <div class="fade-bottom"></div>
</section>
```

## Selector Contract

1. Role ownership is strict: `viewportFrame` owns clipping and edge masks, `wheelStage` owns the continuous rotation and the radial layout origin, `repeatedCard` owns radial placement plus the counter-rotation, and `cardImage` owns the hover zoom.
2. `viewportFrame` and `wheelStage` must be different selectors. The frame never rotates; only the wheel rotates. Rotating the frame would drag the clip mask and fade edges with it.
3. The card counter-rotation effect must use the same duration, easing, and iterations as the wheel spin with the opposite direction (`-360deg` vs `360deg`). Any mismatch makes the cards visibly tumble instead of staying upright.
4. Keep radial placement and counter-rotation on the card roots (`#card-n`), not on the raw `img` descendants. The hover zoom is the only effect that targets the inner image.
5. Each card and each inner image must be wrapped in its own `interact-element`, because cards are counter-rotation targets and images are independent hover targets.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `viewportFrame` | The clipping section that reveals only the top arc and applies the edge/bottom fade masks; never animated. |
| `wheelStage` | The circular turntable that holds all cards and rotates continuously via a `viewEnter` loop. |
| `repeatedCard` | Repeated card roots placed at even angular intervals around the wheel; each counter-rotates to stay upright. |
| `cardImage` | The image inside each card; the sole target of the hover zoom effect. |

## Adaptation Notes

1. Place cards with a radial formula, not literal demo offsets: for card index `i` of `N` cards, `angle = i * (360 / N)` degrees, `x = r * cos(angle)`, `y = r * sin(angle)`, then `margin-left: calc((x − cs/2) * 1vmin)` and `margin-top: calc((y − cs/2) * 1vmin)`, where `--r` is the radius and `--cs` the card size. The demo hard-codes 12 cards at 30° with precomputed cosines — recompute these when `N` changes.
2. Keep radius and card size expressed through the `--r` / `--cs` custom properties in `vmin` so the wheel scales with the viewport and the responsive breakpoints keep working.
3. Reveal the top arc by giving the wheel a positive `margin-top` and clipping with the frame height; the bottom fade layer hides the lower half. Adjust `margin-top` and frame height together when you change the radius.
4. Assign z-index by arc depth (front/lower cards higher) so overlapping cards stack believably; derive it from vertical position rather than copying the demo's exact numbers.
5. The rotation is a continuous `viewEnter` loop (`iterations: Infinity`), not a scroll-driven effect — there is no runway height to size and no ViewTimeline to protect.
6. If the section cannot host a distinct non-rotating frame and a rotating wheel, reject the pattern; collapsing them breaks the clip mask.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `viewportFrame` | `viewportFrame` | `.arc-viewport` | Clipping frame that reveals the top arc; `position: relative`, fixed height, `overflow: hidden`. |
| `wheelStage` | `wheelStage` | `#wheel` | Rotating turntable; the `viewEnter` trigger source and radial layout origin. Must differ from `viewportFrame`. |
| `card1` | `repeatedCard` | `#card-1` | Minimum repeated radial card; extend outward for `card4..cardN`. |
| `card2` | `repeatedCard` | `#card-2` | Repeated radial card. |
| `card3` | `repeatedCard` | `#card-3` | Repeated radial card. |
| `cardImg1` | `cardImage` | `#card-1-img` | Hover-zoom image inside `card1`; extend for `cardImg4..cardImgN`. |
| `cardImg2` | `cardImage` | `#card-2-img` | Hover-zoom image inside `card2`. |
| `cardImg3` | `cardImage` | `#card-3-img` | Hover-zoom image inside `card3`. |

> Repeated keys must keep their trailing index (`card1`, `card2`, … and `cardImg1`, `cardImg2`, …) so they compact into the `card{n}` and `cardImg{n}` groups. Extend both rows to match the real card count (`card4..cardN`, `cardImg4..cardImgN`); the demo uses 12 of each.

## Required Styles

### `viewportFrame` — `.arc-viewport`

```css
.arc-viewport {
  position: relative;
  width: 100%;
  height: 68vh;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
```

Reason: fixes the visible window and clips the wheel so only the top arc shows above the copy; centers the wheel horizontally and anchors it to the top.

### `wheelStage` — `#wheel`

```css
#wheel {
  position: relative;
  width: calc(var(--r) * 2vmin + var(--cs) * 1vmin);
  height: calc(var(--r) * 2vmin + var(--cs) * 1vmin);
  transform-origin: center center;
  margin-top: 10vh;
  flex-shrink: 0;
}
```

Reason: sizes the turntable to the circle diameter plus one card, centers its rotation, and pushes it down so the clip frame exposes the upper arc.

### `repeatedCard` — `.card`

```css
.card {
  position: absolute;
  width: calc(var(--cs) * 1vmin);
  height: calc(var(--cs) * 1vmin);
  left: 50%;
  top: 50%;
  border-radius: var(--cr);
  overflow: hidden;
  transform-origin: center center;
}
```

Reason: anchors every card to the wheel center so the radial `margin` offsets place them on the circle, and centers `transform-origin` so the counter-rotation keeps each card upright.

### `repeatedCard` — `#card-n` (per-card radial placement)

```css
#card-1 {
  margin-left: calc((var(--r) * 1 - var(--cs) / 2) * 1vmin);
  margin-top: calc((var(--r) * 0 - var(--cs) / 2) * 1vmin);
  z-index: 100;
}
```

Reason: positions each card at its angle on the circle (`cos`/`sin` of `i * 360 / N`) offset by half the card size; recompute the multipliers and z-index per card when the count or radius changes.

### `cardImage` — `.card img`

```css
.card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
```

Reason: fills the card frame so the hover scale zooms a cropped image cleanly with no letterboxing.

## Suggested Controls

Expose the wheel geometry and its rotation speed; these are the stable knobs that reshape the pattern without breaking the counter-rotation contract.

### `radius`

- **Label:** `Wheel Radius`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `65`
- **Description:** Controls how large the circle is; larger values push cards farther from the center.
- **Constraints:** `min: 20`, `max: 80`, `step: 1`, `unit: vmin`
- **Binding:** `variable` `--r` using a direct value

### `card-size`

- **Label:** `Card Size`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `20`
- **Description:** Controls the width and height of each image card.
- **Constraints:** `min: 8`, `max: 30`, `step: 1`, `unit: vmin`
- **Binding:** `variable` `--cs` using a direct value

### `spin-duration`

- **Label:** `Spin Speed`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `30000`
- **Description:** Controls how long one full wheel revolution takes; the card counter-rotation duration must match.
- **Constraints:** `min: 8000`, `max: 60000`, `step: 1000`, `unit: ms`
- **Binding:** `effect` `wheel-spin` property `duration` using a direct value, and `effect` `card-counter` property `duration` using the same value

## Interact Template

```ts
// How many cards ride the wheel — recompute radial CSS placement when this changes.
const CARD_COUNT = 12;
const SPIN_DURATION = 30000; // ms per revolution; wheel and counter must match.

// Continuous clockwise spin on the wheel stage.
const wheelSpin = {
  keyframeEffect: {
    name: 'wheel-spin-kf',
    keyframes: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
  },
  duration: SPIN_DURATION,
  iterations: Infinity,
  easing: 'linear',
};

// Counter-rotation so cards stay upright — opposite direction, identical timing.
const cardCounter = {
  keyframeEffect: {
    name: 'card-counter-kf',
    keyframes: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-360deg)' }],
  },
  duration: SPIN_DURATION,
  iterations: Infinity,
  easing: 'linear',
};

// Hover zoom for the image inside a card.
const imgHover = {
  keyframeEffect: {
    name: 'img-hover-kf',
    keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }],
  },
  duration: 250,
  easing: 'ease-out',
  fill: 'both' as const,
};

const cardKeys = Array.from({ length: CARD_COUNT }, (_, i) => `card${i + 1}`);

const config = {
  effects: {
    'wheel-spin': wheelSpin,
    'card-counter': cardCounter,
    'img-hover': imgHover,
  },
  interactions: [
    // Start the loop when the wheel enters view: spin the stage, counter-rotate every card.
    {
      key: 'wheelStage',
      trigger: 'viewEnter',
      effects: [
        { key: 'wheelStage', effectId: 'wheel-spin' },
        ...cardKeys.map((key) => ({ key, effectId: 'card-counter' })),
      ],
    },
    // One hover interaction per card, zooming its own image.
    ...cardKeys.map((key, i) => ({
      key,
      trigger: 'hover',
      effects: [
        { key: `cardImg${i + 1}`, effectId: 'img-hover', triggerType: 'alternate' },
      ],
    })),
  ],
};
```