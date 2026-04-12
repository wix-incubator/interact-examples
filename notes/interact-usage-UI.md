# Interact Usage Across UI Element Examples

A breakdown of how `@wix/interact` was used in each animation, what fell back to CSS transitions or JS, and why.

---

## label.html — Pill Selection List

**Interact:**
- Hover on each pill: background-color (#2a2a2a), color (#ffffff), scale(1.04) via TransitionEffect

**CSS transitions:**
- Pill checked state: background-color, color, border-color (0.3s ease) — driven by `.hidden-checkbox:checked` CSS selector
- Check icon expand: width, opacity, margin (0.3s ease) with stagger delay

**Why CSS:** The checked/unchecked visual state is driven by a hidden `<input type="checkbox">` and the `:checked` CSS pseudo-class. Interact has no trigger for checkbox state changes — only hover, click, scroll, etc. The `:checked +` sibling selector is pure CSS state that interact can't observe.

---

## lock-toggle.html — Availability Toggle

**Interact:**
- Click (alternate) on toggle: slider position (keyframeEffect with 4 offsets for squash-stretch), slider bg color, track bg color, happy/sad icon opacity, label slide in/out — all via keyframeEffect with fill: both

**JS (element.animate):**
- Hover nudge on slider: conditionally animates `left` or `right` depending on current toggle state

**Why JS:** The hover animation needs to know which SIDE the slider is on (left vs right) to nudge in the correct direction. This requires reading runtime state (`data-state` attribute) to decide which CSS property to animate. Interact's hover TransitionEffect is static — it can't conditionally pick different properties based on component state.

---

## password-input.html — Password Field with Eye Icon

**Interact:**
- Hover on eye button: scale(1.05) via TransitionEffect
- Click (toggle) on eye button: lid close (opacity + scaleY), curve show (opacity), pupil hide (opacity), lashes flip (translateY + scaleY) — all TransitionEffect
- pageVisible (once): customEffect that sets up mouse tracking and blink loop

**JS (inside customEffect):**
- requestAnimationFrame loop: continuous pupil eye-tracking (updates SVG cx/cy attributes based on mouse position with easing)
- element.animate: random blink animation (scaleY bounce, 150ms)

**CSS transitions:**
- Pill container: box-shadow, transform, border-color (0.3s) on hover/focus-within
- Language warning: opacity, transform (350ms) on `.visible` class

**Why JS for eye tracking:** Real-time SVG attribute manipulation (cx, cy on circle element) based on continuous mouse position requires a rAF loop. Interact's pointerMove could set CSS custom properties but can't update SVG attributes. The blink uses element.animate because it's a one-shot micro-animation fired at random intervals from JS — interact has no "random timer" trigger.

**Why CSS for pill hover:** The pill `:hover` and `:focus-within` states share the same visual treatment. CSS handles both selectors naturally. Interact doesn't have a `:focus-within` trigger.

---

## dropdown.html / dropdown-light.html — Capsule Dropdown

**Interact:**
- Button hover: border-color, color, translateY(-6px), box-shadow via TransitionEffect
- Chevron hover: color via TransitionEffect
- Option hover: background-color (#ffd78210), color (#ffd782) via TransitionEffect
- Option icon hover: color, opacity, scale(1.2) rotate(-8deg) via TransitionEffect

**CSS transitions:**
- Chevron rotation: transform 300ms on `.open` class
- Menu appear/disappear: opacity, visibility, transform (220ms) on `.open` class
- Option stagger fade-in: opacity + translateY with `calc(var(--i) * 40ms)` delay on `.open` class

**Why CSS:** The open/close state is toggled by 4 different mechanisms: click on trigger (toggle), click outside (close), Escape key (close), option selection (close). Interact's click trigger with `method: 'toggle'` only handles the first one. The other 3 close paths are JS-driven and would cause interact's internal state to desync. CSS transitions responding to a single `.open` class work reliably regardless of which mechanism triggered the state change.

---

## radio-buttons.html — Radio Button Group

**Interact:**
- Hover on each radio: label color (#d4d4d8), ring border-color (#ffd78250), indicator scale(1.15) via TransitionEffect
- Click on each radio: dot elastic bounce (keyframeEffect, 5 keyframes, 750ms, bouncy easing, fill: none)

**CSS transitions:**
- Label color: 0.55s on `.selected`
- Ring border-color: 0.75s on `.selected`
- SVG stroke-dashoffset: 0.95s on `.selected` (ring draw animation)
- Dot scale: 0.55s on `.selected`

**Why CSS:** Radio buttons are mutually exclusive — selecting one deselects all others. The deselection happens on OTHER elements (not the one being clicked). Interact's click trigger only fires on the clicked element and can't reverse effects on sibling elements. CSS transitions on the `.selected` class handle both selection and deselection naturally — add class = animate in, remove class = animate out.

---

## search-input.html / search-input-light.html — Expandable Search

**Interact:**
- Click (alternate) on search icon: pill width 60px to 340px (keyframeEffect, 600ms expo-out), input opacity fade with delay at 35%, border glow — all fill: both
- Pill hover: border-color via TransitionEffect
- Icon hover: rotate(90deg) via TransitionEffect
- Suggestion hover: background, color, translateX(4px) via TransitionEffect

**CSS transitions:**
- Suggestion item stagger: opacity + translateY with `calc(var(--i) * 40ms)` delay on `.visible` class

**JS (state only):**
- Typewriter-style text filtering (textContent manipulation, not animation)
- setTimeout for input focus after expand animation completes

**Why CSS for stagger:** Suggestions are pre-rendered in the DOM. The stagger uses CSS custom property `--i` (set per-item) to calculate transition-delay. This is the same pattern as the dropdown — interact can't stagger effects across multiple elements using CSS variable-based delays. Interact's `sequences` feature could theoretically handle this, but it requires the trigger to be on a parent element, not on a class toggle.

---

## smiley-nav.html / smiley-nav-light.html — Navigation Menu

**Interact:**
- Nav bar hover: border-color via TransitionEffect
- Tab hover (x4): color (#ffd782) via TransitionEffect
- Dropdown link hover (x48): background (#ffd78210), color (#ffd782) via TransitionEffect

**CSS transitions:**
- Dropdown link stagger: opacity + translateY with `calc(var(--i) * 40ms)` delay on `.open` class
- Content panel slide: opacity + translateX (350ms) on `.active` class, with directional `.slide-left` modifier

**Why CSS for content slide:** When switching between tabs, the incoming content slides from the direction you're moving (left-to-right or right-to-left). This requires knowing which tab you came FROM and which you're going TO — information that's computed in JS and applied as a CSS class (`.slide-left`). Interact has no mechanism to conditionally choose animation direction based on runtime state. The stagger pattern is the same as dropdown/search-input.

---

## social-bar.html — Expandable Social Links

**Interact:**
- Hover (alternate) on each social item: ring-container width expand 64px to 264px, arc-left/right translateX split, SVG rotate 180deg, icon opacity + scale out, arc stroke color + glow — all keyframeEffect with fill: both

**JS (setTimeout):**
- Typewriter text reveal: 30ms per character on mouseenter
- Backspace text removal: 15ms per character on mouseleave
- "Copied" badge: 1200ms show/hide on click

**Why JS for typewriter:** Character-by-character DOM text manipulation (setting textContent to progressively longer/shorter substrings) is fundamentally a JS operation. Interact animates CSS properties, not text content. No CSS or interact mechanism can type out arbitrary strings character by character.

---

## on-off-toggle.html — Day/Night Toggle

**Interact:**
- Click (alternate): slider position (keyframeEffect), slider bg/color, track bg, sun/moon icon opacity, label visibility — all keyframeEffect with fill: both

**JS (element.animate):**
- Hover nudge: conditional left/right animation based on current state (same pattern as lock-toggle)

**CSS @keyframes:**
- `sun-pulse-rotate`: continuous 360deg rotation with scale pulse (3s, infinite) on `.is-on:hover`
- `moon-horizontal-loop`: horizontal drift loop (6s, infinite) on `.is-off:hover`

**CSS transitions:**
- Toggle track: transform scale (0.2s) on hover

**Why CSS @keyframes:** Continuous infinite-loop animations (sun spinning, moon drifting) that run WHILE hovering are best expressed as CSS `@keyframes` with `animation: infinite`. They start/stop automatically via CSS selectors (`.is-on:hover`, `.is-off:hover`). Interact doesn't have an "infinite loop while hovering" mode — its `type: 'alternate'` plays once on enter and reverses on leave.

**Why JS for hover nudge:** Same as lock-toggle — the nudge direction depends on runtime state.

---

## Summary

| Pattern | Used interact | Used CSS transitions | Used JS animations |
|---------|:---:|:---:|:---:|
| Hover color/scale/glow | All files | - | - |
| Click state toggle (single element) | lock-toggle, on-off-toggle, search-input, social-bar | - | - |
| Open/close with multiple close paths | - | dropdown, smiley-nav | - |
| Staggered entrance (multiple items) | - | dropdown, search-input, smiley-nav, radio-buttons | - |
| Directional slide (context-dependent) | - | smiley-nav | - |
| Conditional hover (state-dependent direction) | - | - | lock-toggle, on-off-toggle |
| Continuous loop while hovering | - | on-off-toggle (@keyframes) | - |
| Real-time pointer tracking (SVG attributes) | - | - | password-input |
| Text content manipulation | - | - | social-bar |
| Checkbox/radio persistent state | - | label, radio-buttons | - |
