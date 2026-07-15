# Text Cards Slide In

Stacked cards slide into a fixed center stage on scroll, alternating from left and right.

## Summary

- **ID:** `text-cards-slide-in`
- **Target shape:** Best for 3–6 similarly sized content cards that should reveal one-at-a-time over a fixed backdrop, each driven by its own full-viewport scroll step.
- **Description:** A fixed, centered stage holds a stack of cards; as the page scrolls, each card slides in from alternating sides (odd from the left, even from the right) with a 3D perspective swing and lands centered on top of the previous one.

## Demo HTML

```html
<!-- Fixed backdrop, always visible behind the cards -->
<div class="hero">
  <interact-element data-interact-key="hero-title"><h1>The Journey</h1></interact-element>
  <interact-element data-interact-key="hero-subtitle"><p>From idea to completion</p></interact-element>
</div>
<div class="hero-spacer"></div>

<!-- Fixed, centered stage that pins all cards in place -->
<div class="card-stage">
  <interact-element data-interact-key="card-1" class="card-wrapper"><div class="card">…</div></interact-element>
  <interact-element data-interact-key="card-2" class="card-wrapper"><div class="card">…</div></interact-element>
  <interact-element data-interact-key="card-3" class="card-wrapper"><div class="card">…</div></interact-element>
  <interact-element data-interact-key="card-4" class="card-wrapper"><div class="card">…</div></interact-element>
</div>

<!-- One full-viewport scroll step per card, plus a trailing spacer -->
<div class="scroll-canvas">
  <interact-element data-interact-key="trigger-1"><div class="scroll-section"></div></interact-element>
  <interact-element data-interact-key="trigger-2"><div class="scroll-section"></div></interact-element>
  <interact-element data-interact-key="trigger-3"><div class="scroll-section"></div></interact-element>
  <interact-element data-interact-key="trigger-4"><div class="scroll-section"></div></interact-element>
  <div class="scroll-section"></div>
</div>
```

## Selector Contract

1. Role ownership is strict: each `scrollTrigger` owns one card's scroll runway and `viewProgress` source, `cardStage` owns the fixed centered pinning, and `repeatedCard` owns the slide transform plus stacking `z-index`.
2. The pairing is one-to-one: `trigger{n}` drives `card{n}`. Do not collapse all cards onto a single trigger — each card needs its own scroll step or they all animate at once.
3. `cardStage` must be a different element from the scroll triggers. The stage is a fixed overlay; the triggers live in normal document flow because they are what create the scroll distance.
4. Cards stack with increasing `z-index` so each new card lands on top. Keep that ordering when adding cards.
5. The animated node is the card wrapper (`data-interact-key="card-{n}"`), not the inner content element. Start it hidden and let the effect reveal it.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollTrigger` | A full-viewport (`100vh`) section in normal flow; its `viewProgress` drives exactly one card. One per card. |
| `cardStage` | A fixed, full-viewport, centered overlay that pins every card in the same spot. `pointer-events: none` so it never blocks scrolling. |
| `repeatedCard` | Absolutely positioned card wrappers, all overlapping at the stage center, stacked by `z-index`, that slide in from off-screen. |
| `staticBackdrop` | Optional fixed hero behind the cards that fades in once on first view. Decorative, not required for the slide mechanic. |

## Adaptation Notes

1. Scroll distance is one `100vh` step per card plus one trailing spacer section. `N` cards → `N` trigger sections + 1 spacer.
2. The off-screen start distance (`120vw` in the demo) must exceed half the viewport so cards fully clear the stage before sliding in; reduce it if the stage is narrow or the runway feels too long.
3. `cardStage` is `position: fixed`, not `sticky` — it floats above the scroll canvas via `z-index` and uses `pointer-events: none` so the page still scrolls through it.
4. Alternate `enter-from-left` / `enter-from-right` by card index parity (odd → left, even → right). For a calmer look, pick one direction for every card.
5. Always provide a reduced-motion fallback: swap the slide for a plain opacity `fade-center` under a `(prefers-reduced-motion: reduce)` condition.
6. Cards start hidden and use `fill: both` so they persist after entering and accumulate centered. Do not reset them at range end.
7. To change card count, extend `card4..cardN` and `trigger4..triggerN` together as matched pairs, continuing the z-index increase and the left/right alternation.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollCanvas` | container | `.scroll-canvas` | Holds the per-card scroll steps; `z-index: 0` so it sits below the fixed stage. |
| `trigger1` | `scrollTrigger` | `.scroll-canvas > interact-element:nth-child(1)` | `viewProgress` source for `card1`; extend outward for `trigger4..triggerN`. |
| `trigger2` | `scrollTrigger` | `.scroll-canvas > interact-element:nth-child(2)` | `viewProgress` source for `card2`. |
| `trigger3` | `scrollTrigger` | `.scroll-canvas > interact-element:nth-child(3)` | `viewProgress` source for `card3`. |
| `cardStage` | `cardStage` | `.card-stage` | Fixed, centered overlay pinning the cards; `pointer-events: none`. |
| `card1` | `repeatedCard` | `[data-interact-key="card-1"]` | Minimum slide-in card (odd → from left); extend for `card4..cardN`. |
| `card2` | `repeatedCard` | `[data-interact-key="card-2"]` | Slide-in card (even → from right). |
| `card3` | `repeatedCard` | `[data-interact-key="card-3"]` | Slide-in card (odd → from left). |
| `heroTitle` | `staticBackdrop` | `[data-interact-key="hero-title"]` | Optional: backdrop title that fades up once on first view. |
| `heroSubtitle` | `staticBackdrop` | `[data-interact-key="hero-subtitle"]` | Optional: backdrop subtitle, fades up shortly after the title. |

> Repeated keys must keep their trailing index (`card1`/`trigger1`, `card2`/`trigger2`, …) so they compact into the `card{n}` / `trigger{n}` groups; extend the rows as matched `card4`+`trigger4` … `cardN`+`triggerN` pairs.

## Required Styles

### `scrollTrigger` — `.scroll-section`

```css
.scroll-section {
  height: 100vh;
}
```

Reason: gives each card one full viewport of scroll so its `viewProgress` (entry 0%→100%) plays out across a single screen.

### `cardStage` — `.card-stage`

```css
.card-stage {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
}
```

Reason: pins every card to the same centered spot above the scroll canvas while letting scroll events pass straight through.

### `repeatedCard` — `.card-wrapper`

```css
.card-wrapper {
  position: absolute;
  width: var(--card-stage-width, 630px);
  aspect-ratio: 4 / 3.2;
  opacity: 0;
  transform-origin: center center;
  will-change: transform, opacity;
}

.card-wrapper:nth-child(1) { z-index: 1; }
.card-wrapper:nth-child(2) { z-index: 2; }
.card-wrapper:nth-child(3) { z-index: 3; }
.card-wrapper:nth-child(4) { z-index: 4; }
```

Reason: overlaps all cards at the stage center, hides them until their effect reveals them, and stacks them so each new card lands on top of the last.

## Suggested Controls

Expose the slide travel and the perspective swing as the core feel knobs; card width is a secondary layout knob.

### `slide-distance`

- **Label:** `Slide Distance`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `120`
- **Description:** How far off-screen each card starts before sliding to the center stage.
- **Constraints:** `min: 60`, `max: 160`, `step: 10`, `unit: vw`
- **Suggested variable:** `--card-slide-distance`

### `tilt`

- **Label:** `Swing Tilt`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `14`
- **Description:** The 3D Y-axis rotation applied as a card swings in; `0` gives a flat horizontal slide.
- **Constraints:** `min: 0`, `max: 30`, `step: 1`, `unit: deg`
- **Suggested variable:** `--card-tilt`

### `card-width`

- **Label:** `Card Width`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `630`
- **Description:** Width of the cards on the centered stage; the height follows from the `4 / 3.2` aspect ratio.
- **Constraints:** `min: 360`, `max: 800`, `step: 10`, `unit: px`
- **Suggested variable:** `--card-stage-width`

## Interact Template

```ts
// Each card's viewProgress runs across the entry of its own scroll step.
const entryRange = {
  rangeStart: { name: 'entry', offset: { value: 0, unit: 'percentage' } },
  rangeEnd: { name: 'entry', offset: { value: 100, unit: 'percentage' } },
  easing: 'ease-out',
  fill: 'both' as const,
};

// Illustrative travel/tilt — wire these to --card-slide-distance / --card-tilt.
const SLIDE = '120vw';
const TILT = '14deg';
```

```ts
const conditions = {
  'full-motion': { type: 'media', predicate: '(prefers-reduced-motion: no-preference)' },
  'reduced-motion': { type: 'media', predicate: '(prefers-reduced-motion: reduce)' },
};

const effects = {
  'enter-from-left': {
    keyframeEffect: {
      name: 'enter-left',
      keyframes: [
        { opacity: -0.6, transform: `perspective(800px) translateX(-${SLIDE}) rotateX(-6deg) rotateY(${TILT})` },
        { opacity: 1, transform: 'perspective(800px) translateX(0) rotateX(0) rotateY(0)' },
      ],
    },
    ...entryRange,
  },
  'enter-from-right': {
    keyframeEffect: {
      name: 'enter-right',
      keyframes: [
        { opacity: -0.6, transform: `perspective(800px) translateX(${SLIDE}) rotateX(-6deg) rotateY(-${TILT})` },
        { opacity: 1, transform: 'perspective(800px) translateX(0) rotateX(0) rotateY(0)' },
      ],
    },
    ...entryRange,
  },
  // Reduced-motion fallback: no travel, just a fade.
  'fade-center': {
    keyframeEffect: { name: 'fade-center', keyframes: [{ opacity: 0 }, { opacity: 1 }] },
    ...entryRange,
  },
};
```

```ts
// One interaction per card: trigger{n} drives card{n}, direction by index parity.
const cardKeys = ['card1', 'card2', 'card3'] as const;

const cardInteractions = cardKeys.map((cardKey, i) => ({
  key: `trigger${i + 1}`,
  trigger: 'viewProgress',
  effects: [
    { key: cardKey, effectId: i % 2 === 0 ? 'enter-from-left' : 'enter-from-right', conditions: ['full-motion'] },
    { key: cardKey, effectId: 'fade-center', conditions: ['reduced-motion'] },
  ],
}));

// Optional backdrop: hero fades up once when it first enters the viewport.
const heroInteractions = [
  {
    key: 'heroTitle',
    trigger: 'viewEnter',
    params: { type: 'once' },
    effects: [{
      keyframeEffect: { name: 'hero-title-fade', keyframes: [
        { opacity: 0, transform: 'translateY(16px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ] },
      duration: 800, easing: 'ease-out', fill: 'forwards',
    }],
  },
  {
    key: 'heroSubtitle',
    trigger: 'viewEnter',
    params: { type: 'once' },
    effects: [{
      keyframeEffect: { name: 'hero-sub-fade', keyframes: [
        { opacity: 0, transform: 'translateY(16px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ] },
      duration: 800, delay: 400, easing: 'ease-out', fill: 'forwards',
    }],
  },
];

const interactions = [...heroInteractions, ...cardInteractions];
```
