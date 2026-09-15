# Cards Peel Off Scroll

Stacked text cards pin in place and peel away one by one as you scroll.

## Summary

- **ID:** `cards-peel-off-scroll`
- **Target shape:** Best for 3–6 full-screen, similarly sized "story" cards that should stack and reveal sequentially — each card needs its own tall scroll runway, not a single shared sticky stage.
- **Description:** A series of centered cards rest at slight alternating tilts; as the page scrolls each top card rotates a little further and fades out, peeling away to reveal the next card pinned beneath it. The last card tilts in and stays.

## Demo HTML

```html
<section class="hero">
  <h1>The Journey</h1>
  <p>From idea to completion</p>
</section>

<section class="card-section first">
  <div class="card-wrap">
    <div class="card" data-interact-key="card-1">…</div>
  </div>
</section>
<section class="card-section second">
  <div class="card-wrap">
    <div class="card dark" data-interact-key="card-2">…</div>
  </div>
</section>
<section class="card-section third">
  <div class="card-wrap">
    <div class="card" data-interact-key="card-3">…</div>
  </div>
</section>
<section class="card-section fourth">
  <div class="card-wrap">
    <div class="card dark" data-interact-key="card-4">…</div>
  </div>
</section>
```

## Selector Contract

1. Role ownership is strict and **per card**: each `scrollSource` (card section) owns its own runway + stacking offset (min-height, negative margin, z-index), each `stickyFrame` (card wrap) owns the sticky pin, and each `repeatedCard` (card root) owns the resting tilt + peel transform.
2. Cards do **not** share one sticky stage. Every card has its own section + sticky wrap; sections overlap via negative `margin-top`. Collapsing them into a single sticky container turns this into a fan/spread pattern, not a peel-off.
3. `z-index` must **descend** from the first card to the last (first on top). Equal or ascending z-index breaks the reveal order — the top card must peel away to expose the one beneath.
4. The peel transform belongs on the card root (the `data-interact-key` element), never on the icon, heading, or text descendants.
5. Do not clip the sticky frame — cards rotate beyond their own box as they peel. Keep `overflow` visible on the frame; only the page/body may use `overflow-x: hidden`. Use rendered `#comp-...` ids in Wix, never `DESKTOP--...` ids.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | The tall card section that drives one card's `viewProgress` exit; owns the stacking offset (min-height = runway, negative margin pulling it over the previous section, descending z-index). |
| `stickyFrame` | A `position: sticky`, `100dvh` wrapper that pins a single card centered in the viewport while its section scrolls past. |
| `repeatedCard` | The card root that rests at a slight tilt and rotates further while fading to transparent as it peels off — or, for the final card, tilts in on enter and stays. |

## Adaptation Notes

1. Each card is a self-contained stack: `scrollSource` section (runway) → `stickyFrame` wrap (pin) → `repeatedCard` card. Repeat the unit per card; do not merge them into one shared stage.
2. Stacking-offset formula for card *n* (1-based): `min-height` is the peel runway (≈ `(2 + n) × 100dvh`; longer = slower peel), `margin-top` of every card after the first = `-(previous section's min-height)` so it begins overlapping where the previous card pinned, and `z-index = count − n + 1` (first card highest).
3. Resting tilt alternates sign with a small magnitude (≈ ±2.5–5°). On peel, the card rotates a further ~6° **in the same direction** while `opacity` goes `1 → 0` across the `exit` range.
4. The **last** card uses `viewEnter` (tilt in once) instead of a `viewProgress` exit — it is the final layer and must not peel away.
5. Cards are viewport-relative (≈`57.6dvh` wide, `5 / 4` aspect). Keep each card inside its sticky frame; on narrow widths clamp width to `min(57.6dvh, calc(100vw - gutter))`.
6. The hero is an optional fixed entrance accent (fade + rise on `viewEnter`); include or drop it independently of the card stack.
7. When item count changes, extend `card4..cardN` by repeating the section/frame/card unit and continuing the min-height / margin / z-index formulas. The last card is always the enter-only one.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `card1` | `repeatedCard` | `.card-section.first .card` | Top card; rests at a slight tilt and peels off (rotate + fade) over its exit range. |
| `card2` | `repeatedCard` | `.card-section.second .card` | Peels off to reveal `card3`. |
| `card3` | `repeatedCard` | `.card-section.third .card` | Peels off to reveal `card4`. |
| `card4` | `repeatedCard` | `.card-section.fourth .card` | Final layer; tilts in on `viewEnter` and stays (does not peel). |

> Repeated card keys must keep their trailing index (`card1`, `card2`, …) so they compact into the `card{n}` group; extend the row as `card4..cardN` for more items, keeping the last key as the enter-only card.

## Required Styles

### `scrollSource` — `.card-section`

```css
.card-section {
  position: relative;
}
.card-section.first  { min-height: 280dvh; z-index: 4; }
.card-section.second { min-height: 440dvh; margin-top: -280dvh; z-index: 3; }
.card-section.third  { min-height: 600dvh; margin-top: -440dvh; z-index: 2; }
.card-section.fourth { min-height: 700dvh; margin-top: -600dvh; z-index: 1; }
```

Reason: each section supplies its card's scroll runway; the negative `margin-top` overlaps it onto the previous section so the next card pins beneath the current one, and descending `z-index` keeps earlier cards on top so they peel away first. Recompute heights/margins/z-index from real card count — these literals are for four cards.

### `stickyFrame` — `.card-wrap`

```css
.card-wrap {
  position: sticky;
  top: 0;
  height: 100dvh;
  display: grid;
  place-items: start center;
  padding: max(10rem, 27dvh) 2rem 2rem;
}
```

Reason: pins one card centered near the top of the viewport while its section scrolls; no `overflow` clip so the card can rotate past its box during the peel.

### `repeatedCard` — `.card`

```css
.card {
  --tilt: 0deg;
  width: var(--card-width, 57.6dvh);
  aspect-ratio: 5 / 4;
  transform: rotate(var(--tilt));
  transform-origin: center center;
  will-change: transform, opacity;
}
.card-section.first  .card { --tilt: -4deg; }
.card-section.second .card { --tilt: 5deg; }
.card-section.third  .card { --tilt: -3.5deg; }
.card-section.fourth .card { --tilt: 2.5deg; }
```

Reason: sets each card's resting tilt and viewport-relative size; the peel keyframes start from this resting `rotate(var(--tilt))` and carry it further while fading. `will-change` keeps the rotate/opacity animation smooth.

## Suggested Controls

Expose the pattern's core feel knobs — resting tilt, peel intensity, and card size. The adapting agent wires each variable into the styles and keyframes it emits.

### `card-tilt`

- **Label:** `Card Tilt`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `4`
- **Description:** Base magnitude of each card's resting tilt; the sign alternates per card.
- **Constraints:** `min: 0`, `max: 10`, `step: 0.5`, `unit: deg`
- **Binding:** `variable` `--card-tilt` using template `${value}deg`

### `peel-rotation`

- **Label:** `Peel Rotation`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `6`
- **Description:** Extra degrees a card rotates while it fades out and peels away.
- **Constraints:** `min: 2`, `max: 20`, `step: 1`, `unit: deg`
- **Binding:** `variable` `--card-peel-rotation` using template `${value}deg`

### `card-width`

- **Label:** `Card Width`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `57.6`
- **Description:** Card width relative to viewport height; cards keep a 5 / 4 aspect ratio.
- **Constraints:** `min: 30`, `max: 80`, `step: 1`, `unit: dvh`
- **Binding:** `variable` `--card-width` using template `${value}dvh`

## Interact Template

```ts
// Each top card peels across its EXIT range; progress is the card leaving the viewport.
const exitRange = {
  rangeStart: { name: 'exit', offset: { value: 0, unit: 'percentage' } },
  rangeEnd: { name: 'exit', offset: { value: 100, unit: 'percentage' } },
  easing: 'ease-in',
  fill: 'both' as const,
};

// Resting tilt per card — alternating, small. Recompute for the real card count.
const TILTS = [-4, 5, -3.5, 2.5];
const PEEL_EXTRA = 6; // extra degrees rotated while fading out (see peel-rotation control)

// Top cards: rotate further in the same direction + fade to 0 as they leave.
const peelEffect = (key: string, tilt: number) => ({
  key,
  trigger: 'viewProgress',
  conditions: ['full-motion'],
  effects: [{
    keyframeEffect: {
      name: `${key}-peel`,
      keyframes: [
        { transform: `rotate(${tilt}deg)`, opacity: 1 },
        { transform: `rotate(${tilt + Math.sign(tilt) * PEEL_EXTRA}deg)`, opacity: 0 },
      ],
    },
    ...exitRange,
  }],
});

// Final card: tilts in once on enter and stays (does not peel).
const enterTiltEffect = (key: string, tilt: number) => ({
  key,
  trigger: 'viewEnter',
  params: { type: 'once' },
  conditions: ['full-motion'],
  effects: [{
    keyframeEffect: {
      name: `${key}-enter`,
      keyframes: [{ transform: 'rotate(0deg)' }, { transform: `rotate(${tilt}deg)` }],
    },
    duration: 600,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    fill: 'forwards',
  }],
});

const interactions = [
  // every card except the last peels off…
  ...TILTS.slice(0, -1).map((tilt, i) => peelEffect(`card${i + 1}`, tilt)),
  // …the last card tilts in and stays.
  enterTiltEffect(`card${TILTS.length}`, TILTS[TILTS.length - 1]),
];

// Gate motion on user preference.
const conditions = {
  'full-motion': { type: 'media', predicate: '(prefers-reduced-motion: no-preference)' },
};
```
