# Diagonal Shuffle

Cards fly in diagonally from alternating corners, rotating and scaling into a loose center stack as the section scrolls. Any text attached to the images is lifted out into a sticky caption that alternates in sync with the stack.

## Summary

- **ID:** `diagonal-shuffle`
- **Target shape:** Best for 3–7 similarly sized **image-primary** subjects (photos/thumbnails, optionally with a short caption/number/label) that can be absolutely centered inside one sticky viewport stage, where each can animate independently over a staggered scroll range. **Not for text-content grids** (blog/feature/amenity cards built from heading + paragraph + button) — those are a reject (see the Gate).
- **Description:** Several centered image cards each fly in from an alternating bottom corner (odd from bottom-left, even from bottom-right), un-rotating and scaling up to settle at a slight tilt as the section scrolls past, converging into a loose pinned stack. Any text that belonged to each image is displayed separately as a sticky caption that fades in while its image is the one at center and fades out as the next image arrives.
- **Core motion (non-negotiable):** This is a **CONVERGENCE**. Cards must start off-screen and *gather* onto a single point at the center of a **sticky, pinned stage**. If the cards end up in their normal in-flow layout slots (a spread-out row/grid), the pattern has NOT been reproduced. Sticky pinning + absolute centering is what makes the convergence exist. **A convergence that flies cards in but then lets the stage scroll away — leaving frames mostly blank after the first card — is an equally severe failure: the pattern only counts as reproduced if the stack forms AND remains pinned at center through the full scroll range.**
- **A "Card" in the source is a BUNDLE: image + the text/button beneath or beside it.** The most common misread of this pattern is failing to see that the image and the paragraph/number/button under it are **one repeated unit**. Recognize the whole bundle — then *never* animate the bundle. What flies is ONLY the image extracted from it; the text is handled separately (lifted to a sticky caption) or the section is rejected. Binding a card to the bundle (or to the text-bearing part of it) tilts whole text blocks and buttons into a diagonal mess with no convergence — the single most disqualifying outcome.
- **What flies is ONE clean image node — never a bundle, cell, or caption-bearing node.** The animated card must be a single, text-free visual node (an image-only clone). If any label, caption, number, heading, or button rides along on the converging card, the pattern is NOT reproduced. This holds even when the convergence itself (sticky + centering) works.
- **Attached text becomes a sticky, alternating caption — it does NOT ride the stack and does NOT stay in the scattered grid.** When each image has an associated short caption/label/number, lift that text into a separate sticky caption layer pinned top-left on the stage. Each caption fades in as its image reaches center and fades out as the next image flies in, so exactly one caption reads at a time. This is how the text stays legible and synced without polluting the image stack.
- **THE ONE SANCTIONED BUILD:** There is exactly **one** way to build this pattern: **synthesize a fresh standalone sticky stage layered over the section, clone ONLY each `<img>` into fresh empty wrappers as the cards, and (if images carry text) lift each caption into a synthesized sticky caption layer.** You do not reuse the section's grid/gallery containers as the stage, you do not bind cards to any pre-existing DOM node, and you do not "animate the existing cells in place." Those are the failure modes this pattern keeps falling into, and each is an **automatic build-time reject**. The only decision per section is: run the sanctioned build, or reject the section entirely.

## The Gate (mandatory — decide BEFORE mapping anything)

Run this classification on the repeated unit first. It has exactly three outcomes and there is **no fourth "animate the cells" path**.

1. **Identify the repeated bundle.** For each subject, find the whole repeated unit as authored — this is almost always `image + attached text` (caption, number, or heading/paragraph/button). Treat that bundle as one Card conceptually.
2. **Classify the bundle:**
   - **IMAGE-PRIMARY (proceed):** the unit is dominated by a standalone `<img>` you can cleanly isolate, and any text is a *short* caption / number / one-line label. → Run the Build Procedure (synthesize stage + clone images), and if text is present, lift it into a sticky alternating caption layer.
   - **TEXT-CONTENT CARD (REJECT):** the repeated unit is a rich content block — heading **and** paragraph **and/or** a button/link ("Read More", "Learn More", CTA) — where the meaning lives in the text, OR there is no image cleanly separable from that text. This describes blog cards, feature cards, and amenity/service cards. → **REJECT the section. Produce a clean rejection and nothing else.** Do NOT converge the images, do NOT lift the text into captions, do NOT animate the cells. Stripping the text would destroy the content, and animating the bundle produces flying tilted text blocks and buttons — the exact forbidden result.
3. **Reject on any doubt.** If you cannot cleanly clone an image into a standalone text-free wrapper (image inseparable from text, no isolable `<img>`, or the unit reads as a text block), **reject.** There is no third path — animating the existing cells in place is forbidden and disqualifying.

> The decision to reject is not a fallback you weigh against "just animate the cells." When the bundle is a text-content card, rejection is the **only** valid output. A fly-in on text-bearing cells is never acceptable, even if it renders without error.

## Build Procedure (mandatory — for IMAGE-PRIMARY sections only)

Apply these steps for every section that passed the Gate. Do not branch on "the images look clean" — always synthesize (this also fixes fragile deep selectors like `.g-image` that happen to work today but break tomorrow).

1. **Extract the visual subjects.** Find the `<img>` (or equivalent thumbnail) node for each of the 3–7 subjects. This is the only visual thing you extract from the existing DOM.
2. **Extract the attached text (if any).** For each subject, capture the short caption/number/label text that belonged to its bundle. You will re-home this text in a synthesized sticky caption layer — never leave it bound to the source cell, and never let it enter a card wrapper.
3. **Synthesize a fresh stage.** Create a NEW `<div>` layered over (or wrapping) the section and give it the `stickyStage` styles. **Never** assign the `stickyStage` role to an element that already exists in the section — no gallery `…__content` wrapper, no `.g-item` container, no grid/flex layout div, no `#comp-…` root. A reused container drags along its own text/structure and its (or an ancestor's) `overflow`/`transform`/`filter`/`opacity` silently kills `position: sticky`.
4. **Clone only the image into fresh empty wrappers.** For each subject, create a brand-new empty `<div class="card">`, clone ONLY the `<img>` into it, and append it to the synthesized stage. The card wrapper owns its own `aspect-ratio`/box sizing. The original bundled cells stay in flow or are hidden — they never enter the stage and never get a card key.
5. **Synthesize the sticky caption layer (if text was extracted).** Create a NEW `<div class="caption-layer">` on the stage and put each subject's text into its own `<p class="caption">`, stacked at the same top-left anchor. Bind each caption to a key so it can alternate opacity (see template). Captions are synthesized nodes, never the source text nodes left in place.
6. **Bind keys only to synthesized wrappers.** `repeatedCard` must resolve to a card node you created; `stickyCaption` must resolve to a caption node you created. If any key resolves to a pre-existing element (a cell, figure, `.g-item`, or a deep descendant like `.g-item:nth-of-type(n) .g-image` / `… img`), that is an **automatic reject of the mapping**. Fix by cloning into fresh wrappers, or reject the section.

> Structural enforcement: because the card is always a wrapper you created around only an `<img>`, and the caption is always synthesized text, carrying text into the stack becomes impossible and deep/fragile selectors never arise. If you find yourself typing a selector that points into the section's original markup for the stage, a card, or a caption, stop — you have left the sanctioned build.

## Demo HTML

```html
<div class="h-[100vh]"></div>
<section id="scroll-section">
  <div class="sticky-wrapper">
    <div id="card-1" class="card"><img /></div>
    <div id="card-2" class="card"><img /></div>
    <div id="card-3" class="card"><img /></div>
    <div id="card-4" class="card"><img /></div>
    <div id="card-5" class="card"><img /></div>
    <div class="caption-layer">
      <p id="caption-1" class="caption">…</p>
      <p id="caption-2" class="caption">…</p>
      <p id="caption-3" class="caption">…</p>
      <p id="caption-4" class="caption">…</p>
      <p id="caption-5" class="caption">…</p>
    </div>
  </div>
</section>
```

> `.sticky-wrapper` is a freshly synthesized stage; each `.card` holds ONLY the cloned image; `.caption-layer` holds the lifted texts, stacked top-left, alternating opacity. Captions, numbers, titles, and buttons are never inside a flying card. The `.caption-layer` is omitted entirely when the images have no attached text.

## Selector Contract

1. Role ownership is strict: `scrollSource` owns the tall runway, `stickyStage` owns sticky pinning + clipping + perspective, `repeatedCard` owns absolute centering plus the diagonal fly-in transform, and `stickyCaption` owns a pinned top-left text slot with alternating opacity. **These roles cannot be collapsed** — in particular, `stickyStage` is not optional and cannot be replaced by the section's existing in-flow layout container.
2. **`stickyStage` MUST be a synthesized standalone wrapper — reusing an existing container is an automatic reject.** Do not bind it to a gallery/grid/section container (`.comp-…__content`, `.g-item`, a flex/grid layout div, an internal `#comp-…` root), *even if it renders correctly in one preview*. Such wrappers, or an ancestor, frequently carry `overflow: hidden/auto`, `transform`, `filter`, or `opacity < 1` that *silently* kill `position: sticky` and freeze ViewTimeline — the stage scrolls out of view and the converged cards leave the viewport (blank frames). Always create a fresh `<div>` layered over the section.
3. **`repeatedCard` MUST resolve to a node you synthesized in this build — binding it to any pre-existing DOM element is an automatic reject.** The card is a fresh empty wrapper into which you clone ONLY the `<img>`. It must NEVER be a bundle/cell/`.g-item`/figure that also holds a caption, number, title, link, button, or paragraph, and it must NEVER be a deep descendant chain (`.g-item:nth-of-type(3) .g-image`, `.g-item:nth-of-type(n) img`, etc.) — those are fragile even when the node happens to be image-only. If the repeated unit bundles image + text, you extract the image out; you may not point at an inner node inside the cell.
4. **`stickyCaption` (only when images carry text) MUST be a synthesized text node in a sticky layer — never the source text left in place.** Each caption is pinned top-left on the stage and alternates opacity in sync with its card. Captions never sit inside a card wrapper (they would ride the stack) and never stay in the original scattered grid (they would drift with the layout). If a section's text cannot be reduced to a short sticky caption — because it is a rich heading+paragraph+button block — that is a Gate REJECT, not a caption.
5. **There is no "animate in place" option.** For a multi-column flex/grid of cells whose content includes headings, paragraphs, buttons, captions, or numbering, the ONLY allowed responses are (a) if IMAGE-PRIMARY, run the Build Procedure (synthesize a stage, image-only clones, sticky captions) — or (b) REJECT. Mapping those cells to `repeatedCard` and animating them where they sit is forbidden and disqualifying.
6. **Deep descendant card selectors are a rejection-worthy defect, not a warning.** Brittle chains into a gallery's internal DOM are rejected because they (a) break on re-render/re-order, (b) still leave the card nested inside the caption-bearing cell so its text rides along, and (c) target an inner node that has *lost* the card's own `aspect-ratio`/box sizing, so the animated element collapses or distorts. Every card is a stable, synthesized single-node clone wrapper.
7. Repeated cards are absolute children centered on `stickyStage` via `top/left: 50%` + a base `translate(-50%, -50%)`. **Every keyframe transform MUST re-declare that centering translate before adding the fly-in offset.** Omitting it means the cards never gather at center — the #1 motion failure and a direct symptom of skipping the sticky stage.
8. This pattern has no `collection` grid role — cards stack directly on the sticky stage. Do not introduce or reuse a flex/grid wrapper that removes the absolute centering.
9. Keep the fly-in transform on the card roots, not on raw `img` descendants; the `img` fills the card via `object-cover` and must not carry the animation.
10. Use rendered `#comp-...` ids only for locating the source `<img>`/text nodes to clone, never `DESKTOP--...` ids. Do NOT map `stickyStage`, `repeatedCard`, or `stickyCaption` to any `#comp-...` element — those roles are always synthesized.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | The tall section that drives the shared `viewProgress` trigger for every card and caption. This is the one role that may map to an existing section element. |
| `stickyStage` | A **freshly synthesized** sticky viewport-sized wrapper that pins during scroll, clips the flying cards, and provides `perspective`. **Mandatory, always synthesized, never a reused gallery/grid/`…__content`/`#comp-…` container**, and it must stay pinned for the entire scroll range — not just at the start. |
| `repeatedCard` | Absolutely centered sibling cards, each a **freshly synthesized** single-node **image-only** clone wrapper — no caption, number, title, or button, and no pre-existing/deep-descendant selector — that fly in from an alternating corner over a staggered range. Binding this role to any pre-existing DOM node is an automatic reject. |
| `stickyCaption` | **Present only for image-primary sections whose images carry text.** A **freshly synthesized** text node in a sticky top-left layer that fades in while its image is centered and fades out as the next image arrives, so one caption reads at a time. Never a card child; never the original text left in the grid. If the text is a rich heading+paragraph+button block, do not create captions — the section is a Gate REJECT. |

## Adaptation Notes

1. **Run the Gate before anything else.** Image-primary → build. Text-content card (heading+paragraph+button) or no isolable image → clean REJECT with no animation. The one section type that reproduces easily (clean product images) and image galleries with short captions take the *same* build; text-content grids take *no* build.
2. **Recognize the bundle, then split it.** The repeated unit is almost always `image + attached text`. Never animate the bundle. Clone ONLY the `<img>` into a fresh card wrapper; lift the short caption into the sticky caption layer; hide or leave the original cell in flow. The captions/numbers must never enter the stage as card children and never get a card key.
3. **Handle attached text as a sticky, alternating caption.** Pin the caption layer top-left on the stage. Each caption's opacity ramps 0→1 over its own card's fly-in range and 1→0 as the next card flies in (last caption stays visible to the end). This keeps the text readable and in sync while the images pile up cleanly at center. If there is no attached text, omit the caption layer entirely.
4. **Always synthesize even when the source offers a working selector.** A deep selector like `.g-image` may render correctly today because it happens to be image-only, but it is fragile and leaves the node nested in its caption cell. Clone the image into a fresh wrapper anyway — reliability across sections comes from a uniform synthesized build.
5. **Never reuse the gallery's own containers for the stage.** Their internal wrappers (`…__content`, item containers, `#comp-…` roots) are the single most common place sticky silently dies and the most common source of text artifacts and zero-box collapse. Overlay a fresh `<div>` and place the image-only clones + caption layer into it.
6. **Ancestor safety check (required, on the synthesized stage).** After creating the stage, verify that NONE of its ancestors up to the scroll source carries `overflow: hidden`/`auto`, `transform`, `filter`, or `opacity < 1`. Any one breaks `position: sticky` and freezes ViewTimeline. If an offending ancestor exists and cannot be neutralized, hoist the stage above it (or reject).
7. Alternate the fly-in side by index: odd cards enter from bottom-left (negative X, negative rotate), even from bottom-right (positive X, positive rotate). Preserve the small settle rotation so the final stack stays loose.
8. **Stagger from the real card count so the LAST card settles before scroll end.** Do not hard-code the demo's 5-card offsets. Distribute the staggered windows across a usable range that ends around 90% of `cover`, and derive the step from `N`, so the final card fully arrives while the stage is still pinned (never off-screen at the last frame). See the template's `cardRange`. Captions inherit the same per-card timing.
9. Size the runway from card count: `~90vh` per card plus intro/outro slack (demo `450vh` covers five).
10. Off-screen distances are viewport-relative (`±80vw`, `50vh`); keep them in `vw/vh`. Reduce on wide screens if cards feel too far-flung.
11. Cards start visible (`opacity: 1`) and rely on being off-stage + clipped by `overflow: clip`. Captions are the exception — they use explicit opacity keyframes to alternate.
12. **Verify the convergence — motion, cleanliness, and captions, at BOTH ends AND the middle.** Scrub the full scroll range:
    - **Start:** every card off-screen; only the first caption (if any) is beginning to appear.
    - **Mid-scroll (critical):** the stage is STILL pinned at center and the accumulating stack is visible — frames must not go blank after the first card. A blank mid-range means the stage un-pinned (clip/transform ancestor per §6, or a reused wrapper that should never have been used).
    - **Settle:** every card overlaps at center in a tilted stack, none in a distinct layout slot; the **last** card is fully arrived before scroll end, not still off-screen.
    - **Clean stack (mandatory):** the stacked cards show ONLY imagery — no caption text, numbers, titles, or buttons piled in the stack or scattered at the stage bottom. Any text on the flying/stacked cards means a bundle/cell was animated or a deep node targeted — re-run the Build Procedure or reject.
    - **Caption sync (when captions exist):** exactly one caption is legible at a time, pinned top-left, switching as each new image reaches center.
    If any check fails, fix the offending role or reject. "Cards fly in" alone is NOT sufficient evidence.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollSection` | `scrollSource` | `#scroll-section` | The `viewProgress` source for all card and caption effects. May map to an existing section element. |
| `stickyStage` | `stickyStage` | `#scroll-section .sticky-wrapper` | Sticky pin + clip + perspective. Mandatory and **always a synthesized standalone wrapper** — never a reused gallery/grid/`…__content`/`#comp-…` container. Confirm no clip/transform ancestor (Adaptation §6). |
| `card1` | `repeatedCard` | `#card-1` | Minimum repeated fly-in card — a synthesized single-node **image-only** clone wrapper (odd → from left); extend outward for `card4..cardN`. |
| `card2` | `repeatedCard` | `#card-2` | Repeated fly-in card (even → from right). |
| `card3` | `repeatedCard` | `#card-3` | Repeated fly-in card (odd → from left). |
| `card4` | `repeatedCard` | `#card-4` | Repeated fly-in card (even → from right). |
| `card5` | `repeatedCard` | `#card-5` | Repeated fly-in card (odd → from left). |
| `caption1` | `stickyCaption` | `#caption-1` | **Only when images carry text.** Synthesized sticky top-left text, fades in/out in sync with `card1`; extend for `caption4..captionN`. Omit the whole caption row if there is no attached text. |
| `caption2` | `stickyCaption` | `#caption-2` | Sticky caption synced with `card2`. |
| `caption3` | `stickyCaption` | `#caption-3` | Sticky caption synced with `card3`. |
| `caption4` | `stickyCaption` | `#caption-4` | Sticky caption synced with `card4`. |
| `caption5` | `stickyCaption` | `#caption-5` | Sticky caption synced with `card5`. |

> Repeated card and caption keys keep their trailing index (`card1`/`caption1`, …) so they compact into `card{n}`/`caption{n}` groups; extend the rows for more items, alternating card entry side by parity. **Each card key MUST resolve to a synthesized image-only clone wrapper; each caption key to a synthesized sticky text node — both created in this build.** If any key resolves to a pre-existing cell that carries text/buttons, or to a deep descendant, that is an automatic reject. If the Gate classified the section as a text-content card, produce NO elements — reject the section.

## Required Styles

### `scrollSource` — `#scroll-section`

```css
#scroll-section {
  position: relative;
  height: 450vh;
}
```

Reason: creates enough scroll distance for all staggered fly-in ranges to play out.

### `stickyStage` — `#scroll-section .sticky-wrapper`

```css
#scroll-section .sticky-wrapper {
  position: sticky;
  top: 0;
  height: 100vh;
  width: 100vw;
  overflow: clip;
  perspective: 1200px;
}
```

Reason: pins the stage so cards have a single fixed anchor to converge onto, clips off-screen cards without breaking ViewTimeline (`clip`, not `hidden`), and adds depth for the tilt. Never omit it; **always create it fresh**. Sticky only holds if no ancestor between this wrapper and `#scroll-section` sets `overflow: hidden/auto`, `transform`, `filter`, or `opacity < 1` (Adaptation §5–6).

### `repeatedCard` — `#scroll-section .card`

```css
#scroll-section .card {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 90vw;
  max-width: 400px;
  aspect-ratio: 3 / 4;
  border-radius: 1rem;
  transform-style: preserve-3d;
  will-change: transform, opacity;
  overflow: hidden;
}

#scroll-section .card > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (min-width: 768px) {
  #scroll-section .card {
    aspect-ratio: 4 / 3;
  }
}
```

Reason: absolutely centers each card and establishes the base box the keyframe transforms build on; the base `translate(-50%, -50%)` depends on this. If the card is `position: static/relative` (as in-flow grid cells are), the centering translate has nothing to anchor to and the convergence fails. **The card must be a synthesized wrapper that owns its box sizing and contains ONLY the cloned image.**

### `stickyCaption` — `#scroll-section .caption-layer` / `.caption`

```css
#scroll-section .caption-layer {
  position: absolute;
  top: 6vh;
  left: 6vw;
  max-width: min(90vw, 32rem);
  pointer-events: none;
  z-index: 2;
}

#scroll-section .caption {
  position: absolute;   /* all captions share the same top-left anchor */
  top: 0;
  left: 0;
  margin: 0;
  opacity: 0;           /* alternated by the caption effect */
  will-change: opacity;
}
```

Reason: pins every caption to a single top-left slot above the stack (`z-index` over the cards) and defaults them hidden; the caption effect ramps opacity so exactly one reads at a time, synced to its card. Omit this block entirely for sections whose images have no attached text. Never bind these styles to the original text cells — the captions are synthesized nodes.

## Suggested Controls

Expose the fly-in distance and the entrance scale by default; add scroll length only when the section owns its own runway height.

### `fly-distance`

- **Label:** `Fly-In Distance`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `80`
- **Description:** How far off-screen (horizontally) each card starts before shuffling to center.
- **Constraints:** `min: 40`, `max: 100`, `step: 5`, `unit: vw`
- **Binding:** `variable` `--card-fly-distance` using template `${value}vw`

### `start-scale`

- **Label:** `Entrance Scale`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `0.7`
- **Description:** The scale of each card at the start of its fly-in, before it grows to full size.
- **Constraints:** `min: 0.5`, `max: 1`, `step: 0.05`, `unit: x`
- **Binding:** `variable` `--card-start-scale` using a direct value

### `scroll-length`

- **Label:** `Scroll Length`
- **Group:** `Layout`
- **Type:** `range`
- **Default:** `450`
- **Description:** Total scroll runway height; increase for more cards or slower shuffling.
- **Constraints:** `min: 300`, `max: 700`, `step: 25`, `unit: vh`
- **Binding:** `style` `#scroll-section` property `height` using template `${value}vh`

## Interact Template

```ts
const EASING = 'ease-out';

const CARD_COUNT = 5;      // set from the real number of extracted images
const RANGE_START = 5;     // percent of 'cover' where the first card begins
const RANGE_END = 90;      // percent where the LAST card must be fully settled (< 100 so it lands before scroll end)
const CARD_DURATION = 20;  // percent of 'cover' each card takes to fly in

// Count-aware stagger: step so the last card ENDS at RANGE_END, never off-screen at the final frame.
// step = (RANGE_END - RANGE_START - CARD_DURATION) / (CARD_COUNT - 1)  -> a small overlap between neighbours.
const STEP =
  CARD_COUNT > 1 ? (RANGE_END - RANGE_START - CARD_DURATION) / (CARD_COUNT - 1) : 0;
const cardStart = (index: number) => RANGE_START + index * STEP;

const cardRange = (index: number) => ({
  rangeStart: { name: 'cover', offset: { unit: 'percentage', value: cardStart(index) } },
  rangeEnd: { name: 'cover', offset: { unit: 'percentage', value: cardStart(index) + CARD_DURATION } },
  easing: EASING,
  fill: 'both' as const,
});

// Odd cards fly in from bottom-left, even from bottom-right; small settle rotation keeps the stack loose.
// --card-fly-distance (default 80vw) and --card-start-scale (default 0.7) drive the entrance.
// NOTE: the leading `translate(-50%, -50%)` is REQUIRED in BOTH keyframes — it re-declares the
// absolute centering so the card converges onto the stage center.
// GATE (run first): only IMAGE-PRIMARY sections reach this template. Text-content cards (heading +
// paragraph + button) are a clean REJECT — do NOT emit any card/caption effects for them.
// BUILD: `stickyStage` is a FRESHLY SYNTHESIZED wrapper (never a reused gallery/grid/#comp-… container),
// each `card{n}` resolves to a wrapper holding ONLY a cloned <img>, and any attached text lives in the
// synthesized sticky caption layer below — never inside a card.
const flyInEffect = (key: string, index: number, settleRotate: number) => {
  const fromLeft = index % 2 === 0; // index 0,2,4 => card1,card3,card5 => left
  const dx = fromLeft ? 'calc(-1 * var(--card-fly-distance, 80vw))' : 'var(--card-fly-distance, 80vw)';
  const startRotate = fromLeft ? -45 : 45;
  return {
    key,
    keyframeEffect: {
      name: `${key}-fly-in`,
      keyframes: [
        {
          transform: `translate(-50%, -50%) translate(${dx}, 50vh) rotate(${startRotate}deg) scale(var(--card-start-scale, 0.7))`,
          opacity: 1,
        },
        {
          transform: `translate(-50%, -50%) translate(0, 0) rotate(${settleRotate}deg) scale(1)`,
          opacity: 1,
        },
      ],
    },
    ...cardRange(index),
  };
};

// Sticky caption: text lifted out of each image's bundle, pinned top-left, alternating.
// Caption i fades in as card i arrives (its own range) and fades out as card i+1 arrives;
// the last caption holds to scroll end. Emit these ONLY when the images carried short captions.
const captionEffect = (key: string, index: number) => {
  const isLast = index === CARD_COUNT - 1;
  const start = cardStart(index);
  const end = isLast ? 100 : cardStart(index + 1) + CARD_DURATION;
  return {
    key,
    keyframeEffect: {
      name: `${key}-caption`,
      keyframes: isLast
        ? [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 1 }]
        : [
            { opacity: 0, offset: 0 },
            { opacity: 1, offset: 0.3 },
            { opacity: 1, offset: 0.7 },
            { opacity: 0, offset: 1 },
          ],
    },
    rangeStart: { name: 'cover', offset: { unit: 'percentage', value: start } },
    rangeEnd: { name: 'cover', offset: { unit: 'percentage', value: end } },
    easing: EASING,
    fill: 'both' as const,
  };
};

// Final settle tilts taper toward 0 on the last card — recompute for a different count.
const SETTLE_ROTATIONS = [-4, 3, -2, 1, 0];

const HAS_CAPTIONS = true; // false when the extracted images had no attached text

const interactions = SETTLE_ROTATIONS.slice(0, CARD_COUNT).map((rotate, index) => ({
  key: 'scrollSection',
  trigger: 'viewProgress',
  effects: [
    flyInEffect(`card${index + 1}`, index, rotate),
    ...(HAS_CAPTIONS ? [captionEffect(`caption${index + 1}`, index)] : []),
  ],
}));
```