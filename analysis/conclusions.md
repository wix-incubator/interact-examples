# Conclusions from Animation Slider Analysis

Analysis of 44 `@wix/interact` animations and their 211 customization sliders (79 animation, 132 layout).

---

## 1. Pattern Taxonomy

Every animation falls into one of 14 pattern categories. These categories are more meaningful than raw trigger types because they map directly to **user intent** — what the user wants to achieve, not how the code works internally.

### Scroll-Driven Patterns (19 animations, 43% of total)

| Category | Count | Examples | Core Idea |
|----------|-------|----------|-----------|
| **scroll-storytelling** | 4 | ClassicHorizontalScroll, WindowScroll, ExpandingHorizontalScroll, HorizontalAndVerticalScroll | Sequential panel reveals tied to scroll position. The user scrolls through a "story" of content panels. |
| **scroll-card-stack** | 4 | CardSpread, DiagonalShuffle, StickyRepeaterStack, TitleFoldsScroll | Cards that fan out, stack, or shuffle as the user scrolls. Focused on a deck/collection metaphor. |
| **scroll-3d** | 3 | Scroll_3D_Animation, HorizontalCarouselPerspective, DigitalJukebox | 3D perspective transforms driven by scroll. rotateY/X, translateZ, perspective depth. |
| **scroll-shape-morph** | 2 | ShapeScroll, CornerFoldScroll | clipPath morphing (circle→polygon, fold reveals) tied to scroll progress. |
| **scroll-text** | 6 | Aura Stack, Editorial Text Reveal, book animation, Circular_Scroll_Nav, Paragraph_Reveal, textFoldTransition | Typography-focused scroll reveals: text layers, paragraph masks, page flips, editorial layouts. |

**Key insight:** Scroll-driven animations are the dominant pattern (43%). They all share the `viewProgress` trigger and the same speed-control challenge — scroll speed is section height, not playback rate. The `scaleScrollHeights()` approach (scaling tall container heights by `1/speed`) is the universal solution here.

### Hover Patterns (7 animations, 16%)

| Category | Count | Examples | Core Idea |
|----------|-------|----------|-----------|
| **hover-accordion** | 3 | AccordionScrollHorizontal, AccordionScrollVertical, IconText Pro Gallery | Panels expand/collapse on hover. Very consistent slider pattern. |
| **hover-gallery** | 3 | BlurFocus_Gallery, Mirror_Hover_Gallery, HorizontallyScrollingGallery | Grid/gallery items with hover-triggered effects (blur, zoom, clip reveal). |
| **hover-card-spread** | 1 | CardSpreadByHover | Cards fan out on hover. Same visual as scroll-card-stack but hover-triggered. |

**Key insight:** Hover patterns have the most predictable slider sets. Accordion pattern is especially formulaic: `Panel Speed + Open Width/Height` animation sliders, `Border Radius + Gap + Default Width/Height` layout sliders. An LLM can learn this recipe and apply it reliably.

### Pointer-Tracking Patterns (7 animations, 16%)

| Category | Count | Examples | Core Idea |
|----------|-------|----------|-----------|
| **pointer-tilt** | 4 | 3D_Parallax_Gallery, Rotating_Gallery_Grid, Mirror_Mouse_Track, Tunnel_Vision | 3D tilt/rotation following the mouse cursor. Elements rotate toward or away from the pointer. |
| **pointer-trail** | 3 | CursorTrail, DolphinAnimation, Mouse_Track_Infinite_Gallery | Images/particles that follow or respond to cursor movement. |

**Key insight:** Pointer patterns always expose a **Latency** slider (transition smoothing) and a **Direction** toggle (follow vs. invert). These are signature controls unique to this family. Pointer-tilt also consistently needs Perspective.

### Autonomous Patterns (6 animations, 14%)

| Category | Count | Examples | Core Idea |
|----------|-------|----------|-----------|
| **continuous-loop** | 4 | FerrisWheel, WheelCarousel, LoopedTabsWithPerspective, Marquee_Scroll_Velocity | Infinite-loop animations that run on their own. Marquees, rotating wheels, looping carousels. |
| **parallax-lanes** | 2 | HorizontalLanes, VerticalLanes | Multi-row/column parallax strips with alternating direction, infinite loop. |

**Key insight:** Autonomous animations have `iterations: Infinity` and use `speed` (playback rate) directly since they're time-based, not scroll-based. Direction toggle (clockwise/counter-clockwise) is a common control.

### Interaction Patterns (5 animations, 11%)

| Category | Count | Examples | Core Idea |
|----------|-------|----------|-----------|
| **click-interaction** | 3 | EndlessParallax, SmallCarousel, SnakeAnimation | State changes triggered by click/tap. Modals, carousels, toggling states. |
| **entrance-reveal** | 2 | MantaRay (Breathing Gallery), Headline_Images_Overlay | Entrance animation on viewEnter, often combined with hover for secondary interaction. |

---

## 2. Slider Archetypes — Recurring Patterns

Certain slider "recipes" appear across many animations. These are the building blocks the LLM should learn:

### Universal Sliders (appear in 80%+ of animations)

| Slider | Frequency | Tab | Purpose |
|--------|-----------|-----|---------|
| **Speed/Timing** | 41/44 (93%) | animation | Controls how fast the animation plays. Only DigitalJukebox, SmallCarousel, and book animation lack it. |
| **Border Radius** | 37/44 (84%) | layout | Rounds corners on the primary elements. The single most common layout slider. |

### Very Common Sliders (50-80%)

| Slider | Frequency | Tab | Purpose |
|--------|-----------|-----|---------|
| **Gap/Spacing** | ~25/44 (57%) | layout | Controls spacing between elements (grid gap, panel gap, card gap, stack gap). |
| **Element Size** | ~30/44 (68%) | layout | Width, height, or proportional size of the primary elements. |
| **Font Size** | 16/44 (36%) | layout | Text size control. Universal in typography animations, common in image galleries with overlays. |

### Pattern-Specific Sliders (appear within a pattern family)

| Slider | Pattern | Purpose |
|--------|---------|---------|
| **Perspective** | scroll-3d, pointer-tilt, continuous-loop (3D) | Distance from virtual camera. Range: 300–6000px. |
| **Tilt Angle / Max Rotation** | pointer-tilt | Maximum rotation range. 5–90°. |
| **Pointer Latency** | pointer-tilt, pointer-trail | Transition smoothing. 0–1000ms. |
| **Direction** | pointer-tilt, continuous-loop | Follow vs. invert, clockwise vs. counter-clockwise. Always a 2-step toggle (-1 to 1). |
| **Panel Speed + Open Width** | hover-accordion | The accordion recipe. Speed (0.2–3×), Open size (300–1200px). |
| **Density / Count** | pointer-trail, click-interaction | How many particles/images. Integer step. |
| **Blur Intensity** | hover-gallery, scroll-text | Filter blur strength. 0–30px. |

---

## 3. Speed Control — The Most Complex Slider

Speed control appears in 93% of animations but is implemented in **6 different ways** depending on the animation architecture:

| Implementation | When Used | Mechanism |
|----------------|-----------|-----------|
| `speed` (scroll) | `viewProgress` trigger | Scales container height by `1/speed`, requires iframe reload |
| `speed` (playback) | Non-scroll triggers | Sets `animation.playbackRate` on all tracked Web Animations |
| `cssVar` | CSS transition-based animations | Sets a `--panel-speed` or `--drift-speed` variable |
| `sourceConst` | JS-computed animations | Modifies a JS constant like `ANIM_SPEED` or `SCROLL_SPEED` |
| `durationScale` | CSS @keyframes animations | Scales `animation-duration` |
| `gsapScrollSpeed` | GSAP-powered animations | Modifies GSAP scroll trigger speed |

**Crucial learning for the LLM:** When building a new animation, the speed control mechanism must match the animation's trigger type. Scroll-driven animations CANNOT use playback rate (it compresses the scroll range instead of extending it). They must use the height-scaling approach.

---

## 4. Trigger-to-Slider Prediction Matrix

This is the core "recipe book" — given a trigger type, predict which sliders the animation should have:

| Trigger | Guaranteed Sliders | Very Likely Sliders | Optional Sliders |
|---------|-------------------|--------------------|--------------------|
| `viewProgress` | Speed (scroll type), Border Radius | Perspective (if 3D), Gap | Font Size, Entry Scale, Clip Shape |
| `hover` | Speed or Panel Speed, Border Radius | Gap, Open Width/Height | Stagger, Blur, Default Size |
| `pointerMove` | Tilt Angle, Latency, Direction | Perspective, Border Radius | Max Movement, Parallax Depth |
| `pageVisible` | Speed (playback type) | Border Radius, Size | Direction, Density |
| `viewEnter` | Speed (playback type), Border Radius | Padding, Size | Grayscale, Mask Scale |
| `click` | Border Radius | Size (width, height) | Border Width, Count |

---

## 5. CSS Property Families

Sliders target CSS properties in distinct families. Understanding these families helps the LLM pick the right slider types:

### Transform Properties (controlled by animation sliders)
- `rotate`, `rotateX`, `rotateY`, `rotateZ` — rotation
- `translateX`, `translateY`, `translateZ` — movement
- `scale` — sizing
- `skewX` — distortion
- `perspective` — 3D depth

### Layout Properties (controlled by layout sliders)
- `width`, `height`, `maxWidth` — sizing
- `gap`, `padding`, `margin` — spacing
- `gridAutoRows`, `gridTemplateColumns` — grid structure

### Visual Properties (controlled by either tab)
- `borderRadius` — corners
- `borderWidth` — borders
- `opacity` — transparency
- `filter: blur()` — blur effects
- `clipPath` — shape masking

### Typography Properties (controlled by layout sliders)
- `fontSize` — text size
- `letterSpacing` — character spacing
- `lineHeight` — line spacing
- `-webkit-text-stroke-width` — text outline

---

## 6. Complexity Tiers

Animations cluster into three complexity tiers by slider count:

| Tier | Slider Count | Animations | Character |
|------|-------------|------------|-----------|
| **Minimal** | 1–3 | BlurFocus_Gallery, CornerFoldScroll, ExpandingHorizontalScroll, StickyRepeaterStack, book animation, textFoldTransition | Simple, focused effects. One main parameter + basic layout. |
| **Standard** | 4–6 | Most animations (30 of 44, 68%) | The sweet spot. 1-2 animation controls + 2-4 layout controls. |
| **Rich** | 7–9 | Aura Stack (9), Editorial Text Reveal (8), MantaRay (6), SnakeAnimation (6), AccordionScrollH/V (6), 3D_Parallax_Gallery (6), Rotating Gallery Grid (6) | Complex multi-section layouts or animations with many tunable parameters. |

**Observation:** The standard tier (4–6 sliders) is the "natural" complexity level. When creating a new animation, aim for 4–6 sliders unless the animation is inherently simple (single effect) or inherently rich (multi-section editorial layout).

---

## 7. Interesting Cross-Pattern Observations

### Mirror Patterns
Several animations exist as "mirrors" of each other, sharing identical slider recipes but differing in one dimension:
- **HorizontalLanes ↔ VerticalLanes**: Same pattern, rotated 90°. Identical slider types, just `--row-height` vs `--col-width`.
- **FerrisWheel ↔ WheelCarousel**: Same ring rotation pattern, different visual emphasis (bottom arc vs. top arc).
- **AccordionScrollHorizontal ↔ AccordionScrollVertical**: Same accordion, different axis. `Open Width` vs `Open Height`.
- **CardSpread ↔ CardSpreadByHover**: Same visual effect, different trigger (`viewProgress` vs `hover`).

This is powerful for the LLM: once you know one variant, you can generate the other by swapping axis-related parameters.

### The "Accordion Recipe"
The three hover-accordion animations (AccordionScrollH, AccordionScrollV, IconText Pro Gallery) share an almost identical slider structure:
- Animation: Panel Speed (`cssVar --panel-speed`), Open Dimension (`cssVar --panel-open-*`)
- Layout: Border Radius, Gap, Default Dimension

This is the most standardized pattern and should be a "template" the LLM can apply to any expand-on-hover design.

### The "Pointer-Tilt Recipe"
Four animations (3D_Parallax_Gallery, Rotating Gallery Grid, Mirror_Mouse_Track, Tunnel_Vision) share:
- Tilt/Rotation angle
- Pointer Latency (0–1000ms)
- Direction toggle (-1/+1)
- Optional Perspective

This is another reliable template.

### Scroll Speed Is Not Playback Speed
The most important technical distinction: scroll-driven animations control "speed" by changing how much scrolling is needed (container height), NOT by changing playback rate. The LLM must understand that `viewProgress` animations pin content in a tall scrollable container, and speed = `1 / containerHeight`. Faster = shorter container = less scrolling needed.

### sourceConst vs. cssVar vs. css
Three mechanisms achieve similar results (modifying a value) but with different trade-offs:
- `css`: Direct CSS override with `!important`. Works on any element + property. No iframe reload needed.
- `cssVar`: Sets a CSS custom property. Cleaner than `css` but requires the animation to use CSS variables.
- `sourceConst`: Modifies a JavaScript constant in the source code. Requires iframe reload. Used when the value is consumed by JS logic (particle physics, stagger calculations).

The pattern: **prefer `cssVar` when possible** (clean, no reload), fall back to `css` (universal but uses `!important`), use `sourceConst` only for JS-computed values.

---

## 8. Insights for Ani-mate Skill Architecture

### How the LLM Should Use This Data

The Ani-mate skill should guide the LLM through this decision tree:

**Step 1: Classify User Intent → Pattern Category**

| User Says | Pattern | Trigger |
|-----------|---------|---------|
| "scroll animation", "as I scroll", "scrollytelling" | scroll-* | viewProgress |
| "on hover", "when I mouse over" | hover-* | hover |
| "follows my mouse", "tracks cursor" | pointer-* | pointerMove |
| "auto-playing", "continuous", "looping" | continuous-loop | pageVisible |
| "when it enters view", "as it appears" | entrance-reveal | viewEnter |
| "click to expand", "on tap" | click-interaction | click |

**Step 2: Select Sub-Pattern**

Within scroll-driven, is it storytelling (sequential panels), card-stack (deck metaphor), 3D (perspective transforms), shape-morph (clipPath), or text-focused?

**Step 3: Apply Slider Template**

Each pattern has a "default slider set" (see the prediction matrix in section 4). Start with those and adjust based on the specific animation.

**Step 4: Calibrate Ranges**

General range heuristics from the data:
- Speed multipliers: 0.1–3×, step 0.1, default 1
- Border radius: 0–60px, step 1 (larger elements: 0–100px)
- Gap: 0–60px, step 2 (or 0–100px for larger layouts)
- Perspective: 300–3000px, step 50–100
- Font size: 2–12rem (headings), 1–4rem (body), step 0.25–0.5
- Rotation angles: 5–90°, step 1
- Pointer latency: 0–1000ms, step 50
- Element dimensions: 20–100vw/vh, step 1–5

**Step 5: Choose Slider Mechanism**

Decision tree for `type`:
1. Is it speed/timing? → `speed` (for viewProgress scroll), `cssVar` (for CSS transitions), `sourceConst` (for JS timing)
2. Does the animation use CSS variables? → `cssVar`
3. Is the value consumed by JavaScript? → `sourceConst`
4. Is it a direct CSS property override? → `css`

### What Makes a Good Slider Set

From analyzing 44 animations, the best slider sets share these qualities:

1. **Every slider produces visible change.** Bad: a gap slider on a layout with no gap. Good: a gap slider where items visibly spread apart.
2. **Ranges are practical.** The min-max should cover "barely there" to "dramatic" without breaking the layout.
3. **Defaults are the designer's intent.** The `val` should be what the animation looks like out of the box.
4. **Animation vs. layout tab distinction is meaningful.** Animation = motion/timing. Layout = sizing/spacing/appearance.
5. **4–6 sliders total is the sweet spot.** Less feels under-configured. More overwhelms users.

### What an LLM Should Generate for a New Animation

When asked to create a new scrollytelling animation, the LLM should produce:
1. The HTML/CSS/JS using `@wix/interact`
2. A slider configuration matching the pattern template
3. Sensible defaults based on the ranges learned from similar animations
4. CSS variables or constants for the tunable parameters, so sliders can connect to them

The CSV data provides the "training examples" for this: 44 animations × 211 sliders of real-world, tested configurations that the LLM can use as reference points.

---

## 9. Gaps and Future Considerations

- **No responsive breakpoint sliders**: All current sliders control a single value. Future work could add responsive presets (mobile/tablet/desktop).
- **Easing is not slider-controlled**: Most animations hardcode their easing function. A future "easing curve" slider would be valuable but complex to implement.
- **Color is absent**: No animation has color-related sliders. Adding color scheme controls (text color, background, accent) would dramatically expand customization.
- **Stagger patterns**: Only a few animations expose stagger delay as a slider. Stagger is one of the most impactful animation parameters and should be more widely available.
- **The 19 excluded animations** (WIP) will likely add more patterns to the taxonomy, particularly in the typographic/text category.
