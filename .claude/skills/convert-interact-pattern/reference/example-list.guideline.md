# List Stagger Reveal

List items slide up and fade in sequentially as the section enters the viewport.

## Summary

- **ID:** `list-stagger-reveal`
- **Target shape:** Best for any vertically stacked list, repeater, or feed of variable-count items where individual item count is not fixed at authoring time.
- **Description:** As the section scrolls into view, each list item staggers in from below with a fade, driven by the section's viewProgress. Item count is dynamic — the pattern reads children from the list container at runtime.

## Demo HTML

```html
<section class="list-section">
  <ul id="item-list">
    <li class="item">Item 1</li>
    <li class="item">Item 2</li>
    <li class="item">Item 3</li>
    <!-- any number of additional items -->
  </ul>
</section>
```

## Selector Contract

1. `listContainer` and `scrollSource` must be different selectors — the container is a child of the section, not the section itself.
2. The `customEffect` selects direct children of `listContainer` at runtime; do not register individual item keys with `data-interact-key`.
3. Stagger delay is computed from each item's index and total child count — do not hardcode per-item offsets.
4. Do not use `listContainer` for fixed, named elements (titles, CTAs) that require their own independent effect; give those a dedicated key instead.

## Role Guidance

| Role | Guidance |
| --- | --- |
| `scrollSource` | The section that drives the `viewProgress` trigger. |
| `listContainer` | The direct parent of all repeated items. Children are selected at runtime via `customEffect`. Wix: use the repeater root `#comp-...` with `data-testid="repeater"`. |

## Adaptation Notes

1. The stagger formula is `index / total` — recompute `total` from the live child count, not a hardcoded number.
2. If the list is paginated or lazy-loaded, apply the effect only to the initially rendered children; re-running on new batches requires a separate trigger.
3. For horizontal lists or grids, change the stagger axis from `translateY` to `translateX` or omit the translate entirely and rely on opacity alone.
4. If items have variable height, use `opacity` + a fixed `translateY` offset rather than percentage-based movement to avoid layout shifts.

## Required Elements

| Key | Role | Demo Selector | Purpose |
| --- | --- | --- | --- |
| `scrollSection` | `scrollSource` | `.list-section` | The `viewProgress` source for the entire pattern. |
| `listContainer` | `listContainer` | `#item-list` | Parent of all repeated items. Children are iterated in the `customEffect` at runtime — no per-item `data-interact-key` needed. Wix: repeater root `#comp-...` with `data-testid="repeater"`. |

> This pattern uses a single `listContainer` key instead of numbered item keys. The `customEffect` queries `listContainer.children` at runtime, so item count can be dynamic.

## Required Styles

### `scrollSource` — `.list-section`

```css
.list-section {
  min-height: 100vh;
}
```

Reason: ensures the section has enough height to produce a meaningful `viewProgress` range as it enters the viewport.

### `listContainer` — `#item-list`

```css
#item-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
```

Reason: removes default list chrome that would interfere with item positioning.

### `item` — `#item-list > .item`

```css
#item-list > .item {
  will-change: transform, opacity;
}
```

Reason: promotes items to their own layer ahead of the animation to avoid paint during scroll.

## Suggested Controls

### `stagger`

- **Label:** `Stagger`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `0.15`
- **Description:** Controls the delay between each item's entrance, as a fraction of the total scroll range.
- **Constraints:** `min: 0.05`, `max: 0.4`, `step: 0.05`, `unit: fraction`
- **Suggested variable:** `--list-stagger-fraction`

### `slide-distance`

- **Label:** `Slide Distance`
- **Group:** `Motion`
- **Type:** `range`
- **Default:** `32`
- **Description:** How far each item travels upward during its entrance.
- **Constraints:** `min: 0`, `max: 80`, `step: 4`, `unit: px`
- **Suggested variable:** `--list-slide-distance`

## Interact Template

```ts
// Stagger fraction: each item's window is offset by this amount of the total range.
const STAGGER = 0.15;

const interaction = {
  key: 'scrollSection',
  trigger: 'viewProgress',
  effects: [{
    key: 'listContainer',
    customEffect: (container, progress) => {
      const items = Array.from(container.children);
      const total = items.length;

      items.forEach((item, index) => {
        // Each item gets its own [start, end] window within [0, 1].
        const start = (index / total) * (1 - STAGGER);
        const end = start + STAGGER + (1 - STAGGER) / total;
        const itemProgress = Math.max(0, Math.min(1, (progress - start) / (end - start)));

        (item as HTMLElement).style.opacity = String(itemProgress);
        (item as HTMLElement).style.transform = `translateY(${(1 - itemProgress) * 32}px)`;
      });
    },
  }],
};
```
