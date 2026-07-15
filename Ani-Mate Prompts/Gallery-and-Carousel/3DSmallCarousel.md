# 3D Small Carousel

A scroll-driven 3D carousel: the track rotates while cards brighten near the front.

## Summary

- **ID:** `3d-small-carousel`
- **Name:** `3D Small Carousel`
- **Description:** Cards are arranged in a 3D ring and orbit on scroll while cards brighten as they face the viewer.
- **Best for:** `4-12` similarly sized image/card siblings that can be placed as absolute items around a `preserve-3d` carousel.

## Demo HTML

```html
<section class="scroll-section">
  <div id="carousel-stage" class="sticky-stage">
    <div data-testid="internal-container-content" id="carousel" class="carousel">
      <div id="card-1" class="card">1</div>
      <div id="card-2" class="card">2</div>
      <div id="card-3" class="card">3</div>
      <div id="card-4" class="card">4</div>
    </div>
  </div>
</section>
```

## Selector Contract

1. Role ownership is strict: `scrollSection` owns runway, `stickyStage` owns sticky/clipping/perspective, `carousel` owns the stable centered 3D stage, and `repeatedCard` owns orbit transform plus brightness.
2. In Wix, `stickyStage` is the internal-container-root and `carousel` is `#<stickyStageCompId> > [data-testid="internal-container-content"]`. Those selectors must stay distinct.
3. Do not animate `carousel` with `rotateY` in Wix. Orbit each card root with combined transform/filter keyframes instead of rotating the wrapper.
4. Keep 3D placement on repeated card roots, not raw `img` descendants. Cards must become absolute centered items in a `preserve-3d` stage.
5. Compute angle step from item count and radius from card size; four cards are the minimum useful ring.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | The tall section whose `viewProgress` drives carousel rotation and card brightness. |
| `stickyStage` | The non-rotating sticky viewport-height stage that centers, clips, and provides perspective for the 3D carousel. |
| `perspectiveFrame` | Same non-rotating stage when no extra wrapper exists; never the rotating carousel. |
| `carousel` | The internal content child / stable `preserve-3d` stage containing the orbiting cards. |
| `repeatedCard` | Absolute card roots arranged around the carousel with static `rotateY`/`translateZ` placement. |

## Adaptation Notes

1. The source layout does not need to already be a carousel; repeated siblings can be reorganized into an absolute 3D ring with CSS.
2. Preserve the section root outer layout and keep card size close to the source composition instead of introducing viewport-height cards.
3. Make the carousel a stable centered anchor inside the sticky viewport, then reset grid/flex placement on cards and center them on that anchor.
4. Initial per-card placement is formula-driven: repeated card `i` starts at `rotateY(i * 360 / N) translateZ(radius)`.
5. Generate sampled per-card orbit keyframes that combine transform and filter. Do not add a separate wrapper spin effect.
6. If the orbit looks off-center, move the carousel anchor, not the cards one by one.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollSection` | `scrollSource` | `.scroll-section` | The `viewProgress` source for the full 3D carousel scene. |
| `stickyStage` | `stickyStage` | `#carousel-stage` | The shared sticky viewport stage that pins, clips, centers, and provides perspective. Wix: internal-container-root `#comp` id. |
| `perspectiveFrame` | `perspectiveFrame` | `#carousel-stage` | The non-rotating perspective owner. Usually the same selector as `stickyStage`; never `carousel`. |
| `carousel` | `carousel` | `#carousel-stage > [data-testid="internal-container-content"]` | The stable `preserve-3d` stage that directly contains card roots. Wix: MUST be `#<stickyStageCompId> > [data-testid="internal-container-content"]`, never the same selector as `stickyStage`. |
| `card1` | `repeatedCard` | `.scroll-section #card-1` | Minimum repeated ring card; extend for `card5..cardN`. |
| `card2` | `repeatedCard` | `.scroll-section #card-2` | Repeated ring card. |
| `card3` | `repeatedCard` | `.scroll-section #card-3` | Repeated ring card. |
| `card4` | `repeatedCard` | `.scroll-section #card-4` | Repeated ring card. |

## Required Styles

### `scrollSource`

Selector: `.scroll-section`

```css
.scroll-section {
  position: relative;
  min-height: 400vh;
}
```

Reason: creates enough scroll distance for the carousel to rotate smoothly.

### `stickyStage`

Selector: `#carousel-stage`

```css
#carousel-stage {
  position: sticky;
  top: 0;
  height: 100vh;
  width: 100%;
  overflow: clip;
}
```

Reason: pins the scene and prevents horizontal overflow while the carousel rotates. This selector must never receive the carousel `rotateY` effect.

### `perspectiveFrame`

Selector: `#carousel-stage`

```css
#carousel-stage {
  perspective: 1200px;
  perspective-origin: 50% 45%;
  display: flex;
  justify-content: center;
  align-items: center;
  transform-style: preserve-3d;
}
```

Reason: provides depth and centering for the carousel without rotating with it.

### `carousel`

Selector: `#carousel-stage > [data-testid="internal-container-content"]`

```css
#carousel-stage > [data-testid="internal-container-content"] {
  grid-area: auto;
  justify-self: auto;
  align-self: auto;
  position: absolute;
  top: 50%;
  left: 50%;
  display: block;
  width: 0;
  height: 0;
  margin: 0;
  padding: 0;
  overflow: visible;
  transform-style: preserve-3d;
  transform-origin: center center;
}
```

Reason: creates a stable viewport-centered 3D anchor for the absolute cards; do not animate this selector in Wix.

### `repeatedCard`

Selector: `#carousel-stage > [data-testid="internal-container-content"] > .card`

```css
#carousel-stage > [data-testid="internal-container-content"] > .card {
  grid-area: auto;
  justify-self: auto;
  align-self: auto;
  position: absolute;
  top: 0;
  left: 0;
  width: 280px;
  height: 420px;
  margin-left: -140px;
  margin-top: -210px;
  backface-visibility: hidden;
  transform-origin: center center;
  will-change: transform, filter;
}
```

Reason: centers repeated card roots in the carousel stage before per-card orbit transforms are applied. Preserve the source card proportions here with measured px or stage-relative percentages; do not convert cards to viewport-height blocks.

## Interact Template

### Range

```ts
const RANGE = {
  rangeStart: { name: 'cover', offset: { unit: 'percentage', value: 0 } },
  rangeEnd: { name: 'cover', offset: { unit: 'percentage', value: 100 } },
  fill: 'both' as const,
  easing: 'linear',
};
```

### Orbit Keyframes

Per-card keyframes are generated by sampling the ring rotation (`turns * samplesPerTurn + 1` steps) and combining a `rotateY(...) translateZ(radius)` transform with a proximity-based `brightness(...)` filter. Each card `i` is offset by its static angle `i * 360 / cardCount`.

```ts
const orbitKeyframes = (
  cardIndex: number,
  cardCount = 4,
  turns = 2,
  samplesPerTurn = 8,
  radius = '380px',
) => {
  const steps = turns * samplesPerTurn + 1;
  const stepDeg = 360 / samplesPerTurn;
  const cardAngle = cardIndex * (360 / cardCount);

  return Array.from({ length: steps }, (_, step) => {
    const rotation = step * stepDeg;
    const worldAngle = (rotation + cardAngle) % 360;
    const diff = Math.min(worldAngle, 360 - worldAngle);
    const proximity = (Math.cos((diff * Math.PI) / 180) + 1) / 2;
    const brightness = 0.3 + 0.8 * proximity;

    return {
      offset: step / (steps - 1),
      transform: `rotateY(${rotation + cardAngle}deg) translateZ(${radius})`,
      filter: `brightness(${brightness.toFixed(2)})`,
    };
  });
};
```

### Effect Pattern

```ts
const cardOrbitEffect = (key: string, cardIndex: number) => ({
  key,
  keyframeEffect: {
    name: `${key}-orbit`,
    keyframes: orbitKeyframes(cardIndex),
  },
  ...RANGE,
});
```

### Interaction

```ts
{
  key: 'scrollSection',
  trigger: 'viewProgress',
  effects: RING_CARD_NUMBERS.map((cardNumber, index) =>
    cardOrbitEffect(`card${cardNumber}`, index),
  ),
}
```