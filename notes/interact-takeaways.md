# @wix/interact — Takeaways & Conclusions

After building 12 UI element examples (dark + light variants), here are my conclusions on the interact library's strengths, limitations, and areas for improvement.

---

## Where Interact Excels

### Declarative hover effects
Interact's TransitionEffect with `method: 'toggle'` is the library's sweet spot. Declaring hover animations as a config object — duration, easing, style properties — is clean, readable, and easy to maintain. Across all 12 files, every hover effect (button glow, icon rotation, link highlight, ring brightening) was handled by interact with zero issues.

### Click-triggered state animations
The `type: 'alternate'` pattern for click triggers works beautifully for toggle-style interactions: expand/collapse (search-input pill), on/off (lock-toggle, on-off-toggle), show/hide (social-bar arcs). The keyframeEffect with multiple offsets allows for sophisticated motion curves (squash-stretch on the lock-toggle slider) that would be verbose in CSS.

### Effect registry + reuse
Defining effects once in the `effects` object and referencing them via `effectId` across multiple interactions is a major win. The radio-buttons file defines `dot-pop` once and applies it to all 5 buttons. The smiley-nav defines one `link-enter` effect and references it from 48 hover interactions. This keeps the config DRY.

### Selector targeting
The `selector` field on effects lets a single interaction animate multiple nested elements independently — each with its own effect, duration, and easing. The social-bar hover animates the ring container, both arc groups, the SVG, the icon, and the arc strokes all from one hover trigger. This is powerful and something CSS alone can't do as cleanly.

### `fill: 'both'` persistence
For toggle-style animations, `fill: 'both'` keeps the end state applied after the animation completes, and the start state applied before it plays. This eliminates the need for JS to sync visual state after animation — the WAAPI fill mode handles it.

---

## Where Interact Falls Short

### No focus/blur trigger
This is the single biggest gap. Interact has `hover`, `click`, `pointerMove`, `viewProgress`, `viewEnter`, `pageVisible` — but no `focus`, `blur`, or `focus-within` equivalent. Every component that needed focus-driven visual changes (password-input pill border, search-input expansion, dropdown button state) had to fall back to CSS `:focus-within` pseudo-class. The `interest` trigger (hover + focus) exists but isn't documented well enough to rely on.

### No programmatic state control
Interact creates animations declaratively but provides no API to trigger, reverse, or reset them from JS. This means:
- You can't collapse a menu from an outside-click handler (the dropdown problem)
- You can't reverse an animation when a sibling element is clicked (the radio-button deselection problem)
- You can't sync interact's internal toggle state with external state changes

This forced every multi-source state change (open/close from click + outside-click + escape + selection) to use CSS transitions instead of interact, because CSS transitions respond to class changes regardless of what triggered them.

### No stagger/sequence with class-driven triggers
Interact's `sequences` feature can stagger effects across multiple elements, but only when fired by an explicit trigger (hover, click). The most common stagger pattern in these examples — items fading in when a parent gets a class — can't use interact sequences because there's no trigger for "a CSS class was added to an ancestor." Every stagger fell back to CSS `transition-delay: calc(var(--i) * Nms)`.

### Selector conditions don't work dynamically
The `selector` type condition (e.g., `:not(.selected)`) appears to be evaluated once at registration time, not re-evaluated on each trigger event. We tested this with the dropdown's translateY hover issue — adding/removing a class at runtime didn't change whether the condition passed. This makes conditions unreliable for dynamic state guards.

### Can't animate pseudo-elements
Interact's TransitionEffect and keyframeEffect target real DOM elements. CSS `::before` and `::after` pseudo-elements can't be targeted. The search-input's mouse-following gradient (on `::before`) had to use CSS `:hover` for the gradient opacity, even though interact handled the rest of the hover effects.

### Can't animate SVG attributes
Interact animates CSS properties via WAAPI. SVG attributes like `cx`, `cy`, `r` on elements like `<circle>` aren't CSS properties — they're DOM attributes. The password-input eye tracking needed a rAF loop to update `pupil.setAttribute('cx', ...)` because interact (and WAAPI generally) can't animate SVG presentation attributes.

### No continuous loop mode
There's no `type: 'infinite'` or `type: 'loop'` for hover triggers. The on-off-toggle needed a continuously spinning sun and drifting moon while hovering. Interact's `alternate` plays forward once on enter and reverses on leave. CSS `@keyframes` with `animation: infinite` was the only viable approach.

### `display: contents` complicates targeting
`interact-element { display: contents }` is the recommended approach, but it means the interact-element has no box model. You can't animate `width`, `height`, `padding`, or `transform` on it — you must use `selector` to target the first child. This adds indirection. Worse, any effect without `selector` silently applies to the interact-element (which has no visible box), so the animation runs but has no visual effect. This caused confusion with the social-bar expansion.

---

## Where It's Unusable

### Multi-source state management
Any component where the visual state is toggled by more than one mechanism (click + outside-click, focus + blur, keyboard + mouse) cannot use interact for the animated transition. Interact's toggle state is per-trigger — it has no concept of "collapse this regardless of what opened it." The dropdown, search-input collapse, and radio-button deselection all demonstrated this.

### Continuous real-time effects
Mouse tracking that updates DOM attributes (not CSS properties) at 60fps is beyond interact's scope. The password-input eye tracking, the gradient mouse-follow (CSS custom properties set via JS), and any physics-based spring simulation need vanilla JS.

### Text/content manipulation
Typewriter effects, counter animations, and any DOM content changes (textContent, innerHTML) are fundamentally JS operations. Interact animates visual properties, not content.

---

## Recommendations for Improvement

1. **Add `focus` and `blur` triggers** — even just `focus-within` on the interact-element would unlock a huge class of form/input interactions.

2. **Add a programmatic API** — `Interact.setState(key, 'add' | 'remove' | 'toggle')` would solve the multi-source state management problem entirely. It doesn't need to be complex — just a way to externally trigger the same state changes that hover/click triggers do.

3. **Add `type: 'loop'` for hover** — continuous animations while hovering (spinning, pulsing, drifting) are a common micro-interaction pattern. Currently requires CSS @keyframes fallback.

4. **Re-evaluate conditions at trigger time** — make `selector` conditions dynamic so they can gate effects based on current DOM state, not registration-time state.

5. **Support CSS custom property animation** — `setCssVar` exists in the explorer bridge but not in the core library. Being able to animate `--mouse-x`, `--gradient-opacity`, etc. via TransitionEffect would eliminate the need for JS in pointer-tracking scenarios.

6. **Document `interest` trigger better** — it's mentioned as "hover with focus" but it's unclear whether it responds to `focusin` events from child elements (focus-within behavior) or only direct focus on the interact-element.

7. **Add stagger support for class-driven state** — a `listContainer` + `listItemSelector` combined with a CSS class trigger would enable the staggered entrance pattern without CSS transition-delay hacks.

---

## Final Assessment

Interact is excellent at what it was designed for: **declarative, trigger-driven animations on individual elements**. Hover effects, click toggles, scroll-driven animations, and pointer tracking are its core strengths, and it handles them with a clean, maintainable config-driven API.

Where it struggles is at the **boundaries between multiple state sources** and **continuous/looping effects**. Real-world UI components almost always have multiple ways to enter and exit states (click, focus, blur, outside-click, keyboard, sibling interaction), and interact's per-trigger state model doesn't accommodate this. The result is that most components end up using a hybrid approach: interact for hover/click decorative effects, CSS transitions for state-driven animations, and JS for anything that needs runtime logic.

The library would become significantly more powerful with just two additions: a **programmatic state API** and a **focus trigger**. These would eliminate the most common fallback patterns and let interact handle end-to-end animation for most UI components.
