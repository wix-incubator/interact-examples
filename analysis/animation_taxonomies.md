# Animation Taxonomies — Multiple Ways to Categorize 44 Animations

This document explores **9 different lenses** for categorizing the same set of 44 `@wix/interact` animations. Each taxonomy surfaces different insights about the collection and is useful for different purposes (design selection, technical architecture, user-facing discovery, etc.).

---

## Taxonomy 1: By Trigger / Interaction Model (from conclusions.md)

*How the animation is activated. This is the **technical** categorization — it determines speed control mechanism, slider types, and code architecture.*

### Scroll-Driven (`viewProgress`) — 19 animations, 43%

| Sub-pattern | Animations |
|-------------|------------|
| **Scroll Storytelling** (4) | Classic Horizontal Scroll, Window Scroll, Expanding Horizontal Scroll, Horizontal & Vertical Scroll |
| **Scroll Card Stack** (4) | Card Spread, Diagonal Shuffle, Sticky Repeater Stack, Title Folds Scroll |
| **Scroll 3D** (3) | Scroll 3D Animation, Horizontal Carousel Perspective, Digital Jukebox |
| **Scroll Shape Morph** (2) | Shape Scroll, Corner Fold Scroll |
| **Scroll Text** (6) | Aura Stack, Editorial Text Reveal, Book Animation, Circular Scroll Nav, Paragraph Reveal, Text Fold Transition |

### Hover — 7 animations, 16%

| Sub-pattern | Animations |
|-------------|------------|
| **Hover Accordion** (3) | Accordion Scroll Horizontal, Accordion Scroll Vertical, IconText Pro Gallery |
| **Hover Gallery** (3) | Blur Focus Gallery, Mirror Hover Gallery, Horizontally Scrolling Gallery |
| **Hover Card Spread** (1) | Card Spread By Hover |

### Pointer Tracking (`pointerMove`) — 7 animations, 16%

| Sub-pattern | Animations |
|-------------|------------|
| **Pointer Tilt** (4) | 3D Parallax Gallery, Rotating Gallery Grid, Mirror Mouse Track, Tunnel Vision |
| **Pointer Trail** (3) | Cursor Trail, Dolphin Animation, Mouse Track Infinite Gallery |

### Autonomous (`pageVisible`) — 6 animations, 14%

| Sub-pattern | Animations |
|-------------|------------|
| **Continuous Loop** (4) | Ferris Wheel, Wheel Carousel, Looped Tabs With Perspective, Marquee Scroll Velocity |
| **Parallax Lanes** (2) | Horizontal Lanes, Vertical Lanes |

### Direct Interaction — 5 animations, 11%

| Sub-pattern | Animations |
|-------------|------------|
| **Click Interaction** (3) | Endless Parallax, Small Carousel, Snake Animation |
| **Entrance Reveal** (2) | MantaRay (Breathing Gallery), Headline Images Overlay |

---

## Taxonomy 2: By Layout Structure

*How the elements are spatially organized on screen. Useful for a designer asking "I have a grid of images — what animations fit?"*

### Grid Layout — 7 animations

Elements arranged in a 2D grid with rows and columns.

| Animation | Grid Style |
|-----------|-----------|
| 3D Parallax Gallery | Responsive 2–5 column grid |
| Blur Focus Gallery | Responsive auto-fill grid |
| Mirror Hover Gallery | Responsive 8/4/2 column grid |
| Rotating Gallery Grid | Dense 8/4/3/2 column grid |
| Diagonal Shuffle | Cards fly into grid positions |
| MantaRay (Breathing Gallery) | Scattered horizontal row (grid-like) |
| Paragraph Reveal | Inline images within text grid flow |

### Horizontal Strip / Row — 10 animations

Elements arranged in a single horizontal line or scrolling track.

| Animation | Strip Style |
|-----------|------------|
| Accordion Scroll Horizontal | Side-by-side panels |
| Classic Horizontal Scroll | Full-width sequential panels |
| Expanding Horizontal Scroll | Sliding story panels |
| Horizontal Lanes | Multi-row infinite scroll |
| Horizontally Scrolling Gallery | GSAP-driven horizontal gallery |
| Looped Tabs With Perspective | Infinite marquee cards |
| Marquee Scroll Velocity | Dual-row text marquee |
| Mouse Track Infinite Gallery | Pointer-driven horizontal scroll |
| IconText Pro Gallery | Expanding column panels |
| Horizontal & Vertical Scroll | Cards in horizontal track |

### Vertical Stack — 7 animations

Elements stacked vertically, often with scroll-driven reveals.

| Animation | Stack Style |
|-----------|------------|
| Accordion Scroll Vertical | Expanding vertical panels |
| Sticky Repeater Stack | Sticky cards that shrink as you scroll |
| Title Folds Scroll | Cards that fold in from above |
| Text Fold Transition | Text blocks swapping vertically |
| Digital Jukebox | 3D vertical totem |
| Corner Fold Scroll | Fold-reveal vertical panels |
| Window Scroll | 3D rotating panel stack |

### Radial / Circular — 3 animations

Elements positioned on a ring or circular path.

| Animation | Shape |
|-----------|-------|
| Ferris Wheel | Full ring rotation (bottom arc) |
| Wheel Carousel | Full ring rotation (top arc) |
| Circular Scroll Nav | Text items on circular wheel |

### Stacked / Layered (Z-axis) — 7 animations

Elements overlapping on the Z-axis, creating depth.

| Animation | Layer Style |
|-----------|------------|
| Card Spread | Cards fanning out from a stack |
| Card Spread By Hover | Cards fanning out on hover |
| Aura Stack | Text layers at increasing Z-depth |
| Tunnel Vision | Concentric text layers with depth |
| Mirror Mouse Track | Mirrored card pair |
| Headline Images Overlay | Mask reveals over text |
| Editorial Text Reveal | Multi-panel slide reveals |

### Single Element / Full-screen — 3 animations

A single dominant element or full-bleed composition.

| Animation | Style |
|-----------|-------|
| Scroll 3D Animation | Rotating central image with orbiting text |
| Shape Scroll | Full-screen clipPath morph |
| Book Animation | 3D page-flip book |

### Free-form / Scattered — 4 animations

Elements with no rigid grid — organic, floating, or physics-driven placement.

| Animation | Placement |
|-----------|-----------|
| Cursor Trail | Random pop-ups following cursor |
| Dolphin Animation | Arc-based particle burst |
| Endless Parallax | Randomly placed floating tiles |
| Snake Animation | Sine-wave positioned images |

---

## Taxonomy 3: By Content Type

*What kind of content the animation is designed for. Useful for asking "I'm building a portfolio / blog / landing page — which animations suit?"*

### Image-Only — 26 animations (59%)

The animation showcases photos or illustrations with no meaningful text content.

| Category | Animations |
|----------|------------|
| **Image Grids** | 3D Parallax Gallery, Blur Focus Gallery, Mirror Hover Gallery, Rotating Gallery Grid |
| **Image Carousels / Strips** | Accordion Scroll H, Accordion Scroll V, Horizontal Lanes, Vertical Lanes, Horizontally Scrolling Gallery, Mouse Track Infinite Gallery, Looped Tabs With Perspective |
| **Image Wheels** | Ferris Wheel, Wheel Carousel |
| **Image Cards** | Card Spread, Card Spread By Hover, Diagonal Shuffle, Sticky Repeater Stack, Small Carousel |
| **Image Trails** | Cursor Trail, Dolphin Animation |
| **Image Narratives** | Endless Parallax, Snake Animation, MantaRay |
| **Image Reveals** | Shape Scroll |

### Text-Only — 5 animations (11%)

Pure typographic animations with no images (or images are secondary/decorative).

- Tunnel Vision
- Marquee Scroll Velocity
- Text Fold Transition
- Circular Scroll Nav
- Mirror Mouse Track

### Mixed (Image + Text) — 13 animations (30%)

Both text and images are integral to the animation.

| Mix Style | Animations |
|-----------|------------|
| **Scroll editorial** (text headlines + image panels) | Classic Horizontal Scroll, Window Scroll, Expanding Horizontal Scroll, Horizontal & Vertical Scroll, Title Folds Scroll, Corner Fold Scroll |
| **Text with inline images** | Paragraph Reveal, Headline Images Overlay |
| **Typographic + depth** | Aura Stack, Editorial Text Reveal |
| **3D with info cards** | Scroll 3D Animation, Horizontal Carousel Perspective, Digital Jukebox |
| **Text + icon panels** | IconText Pro Gallery, Book Animation |

---

## Taxonomy 4: By Visual "Craziness" / Wow Factor

*How experimental or attention-grabbing the animation is. Ranges from "subtle enough for a corporate site" to "only for creative portfolios." Useful for matching animation intensity to brand voice.*

### Level 1: Subtle & Professional — 11 animations

Refined, restrained motion. Safe for corporate sites, SaaS products, editorial layouts.

| Animation | Why it's subtle |
|-----------|----------------|
| Accordion Scroll Horizontal | Clean expand/collapse, nothing unexpected |
| Accordion Scroll Vertical | Same — polished, predictable |
| Blur Focus Gallery | Gentle blur + scale on hover |
| Mirror Hover Gallery | Soft zoom + overlay |
| Text Fold Transition | Elegant text swap, minimal motion |
| Sticky Repeater Stack | Cards gently scale down while stacking |
| IconText Pro Gallery | Expanding panels, corporate-friendly |
| Marquee Scroll Velocity | Standard marquee with velocity twist |
| Horizontal Lanes | Smooth infinite scroll rows |
| Vertical Lanes | Same in vertical |
| Headline Images Overlay | Sequenced mask reveals, editorial feel |

### Level 2: Polished & Engaging — 16 animations

Noticeable motion that draws attention without overwhelming. Good for brand sites, portfolios, product pages.

| Animation | Character |
|-----------|-----------|
| Card Spread | Satisfying fan-out on scroll |
| Card Spread By Hover | Same effect, hover-triggered |
| Classic Horizontal Scroll | Smooth horizontal storytelling |
| Window Scroll | 3D panel rotation, elegant |
| Expanding Horizontal Scroll | Zoom + slide panels |
| Horizontal & Vertical Scroll | Multi-axis card choreography |
| Title Folds Scroll | Cards fold in with scaling text |
| Diagonal Shuffle | Cards fly in diagonally |
| Looped Tabs With Perspective | 3D skewed marquee |
| Horizontal Carousel Perspective | Smooth 3D card deck |
| MantaRay (Breathing Gallery) | Organic breathing rhythm |
| 3D Parallax Gallery | Tilt cards follow mouse |
| Rotating Gallery Grid | Subtle tilt + reveal |
| Mirror Mouse Track | Mirrored tilt cards |
| Editorial Text Reveal | Multi-section editorial slide |
| Paragraph Reveal | Inline images grow within text |

### Level 3: Bold & Dramatic — 10 animations

Strong visual presence, requires the right design context. Portfolio sites, creative agencies, immersive experiences.

| Animation | Why it's bold |
|-----------|--------------|
| Ferris Wheel | Full ring rotation — can't miss it |
| Wheel Carousel | Same rotational energy, top arc |
| Scroll 3D Animation | Central image rotates dramatically in 3D |
| Digital Jukebox | Full 3D totem with heavy perspective |
| Aura Stack | Layered text at extreme depth |
| Shape Scroll | Full-screen clipPath morphing |
| Corner Fold Scroll | Dramatic page fold reveals |
| Small Carousel | 3D carousel with fly-out expansion |
| Book Animation | 3D page-flip with lighting/shadows |
| Circular Scroll Nav | Giant rotating text wheel |

### Level 4: Experimental / Wild — 7 animations

High "wow" factor, potentially disorienting. Only for creative showcases, art projects, portfolio pieces.

| Animation | Why it's wild |
|-----------|--------------|
| Cursor Trail | Images spawn randomly following cursor |
| Dolphin Animation | Particles arc and burst like dolphins |
| Snake Animation | Sine-wave image snake that converges on click |
| Endless Parallax | Floating tiles in a 2D parallax soup |
| Mouse Track Infinite Gallery | Gallery accelerates with mouse position |
| Tunnel Vision | Nested text layers create infinite-depth illusion |
| Horizontally Scrolling Gallery | ClipPath + 3D rotation on hover — complex |

---

## Taxonomy 5: By Dimensionality

*Whether the animation feels flat, uses pseudo-3D tricks, or employs real 3D transforms.*

### 2D Flat — 17 animations

No perspective, no Z-axis transforms. Everything moves in X/Y with opacity, scale, and clip.

- Accordion Scroll Horizontal
- Accordion Scroll Vertical
- Blur Focus Gallery
- Mirror Hover Gallery
- Classic Horizontal Scroll
- Horizontal & Vertical Scroll
- Horizontal Lanes
- Vertical Lanes
- Marquee Scroll Velocity
- Text Fold Transition
- MantaRay (Breathing Gallery)
- Headline Images Overlay
- Cursor Trail
- Dolphin Animation
- Snake Animation
- Endless Parallax
- IconText Pro Gallery

### 2.5D (Perspective + translateZ) — 15 animations

Uses CSS `perspective` and `translateZ`/`rotateX`/`rotateY` for depth, but no true 3D scene graph.

- 3D Parallax Gallery (rotateZ + body perspective)
- Rotating Gallery Grid (rotateZ + perspective)
- Mirror Mouse Track (Tilt3DMouse with perspective)
- Tunnel Vision (translate3d with scaled layers)
- Card Spread (subtle Z-stacking)
- Card Spread By Hover (same)
- Looped Tabs With Perspective (rotateY skew)
- Sticky Repeater Stack (pointer tilt + perspective)
- Window Scroll (rotateX + translateZ panel flips)
- Diagonal Shuffle (rotate + scale on cards)
- Aura Stack (translateZ layered text)
- Editorial Text Reveal (scale + perspective container)
- Paragraph Reveal (flat but mask width creates depth illusion)
- Shape Scroll (clipPath morphing creates perceived depth)
- Corner Fold Scroll (inset clips simulate folds)

### Full 3D — 12 animations

Heavy use of 3D transforms, perspective, rotateX/Y/Z, and translateZ to create real spatial scenes.

- Scroll 3D Animation (orbiting text + rotating image)
- Horizontal Carousel Perspective (translateZ depth layering)
- Digital Jukebox (perspective + rotateX totem)
- Book Animation (rotateY page flips with shadow vars)
- Ferris Wheel (full 360° ring rotation)
- Wheel Carousel (full 360° ring rotation)
- Small Carousel (3D positioned cards + fly-out)
- Circular Scroll Nav (items placed on circular arc)
- Horizontally Scrolling Gallery (rotate + scale + clipPath)
- Mouse Track Infinite Gallery (parallax-layer scale depth)
- Expanding Horizontal Scroll (scale zoom with panel choreography)
- Title Folds Scroll (entry scale + heading scale creates theatrical depth)

---

## Taxonomy 6: By User Intent / Use Case

*What the site owner is trying to accomplish. This is the most "user-facing" taxonomy — it answers "I want to build X."*

### "Showcase my portfolio / gallery" — 16 animations

Designed to present a collection of images or projects.

| Style | Animations |
|-------|------------|
| **Grid galleries** | 3D Parallax Gallery, Blur Focus Gallery, Mirror Hover Gallery, Rotating Gallery Grid |
| **Scrolling galleries** | Horizontal Lanes, Vertical Lanes, Mouse Track Infinite Gallery, Horizontally Scrolling Gallery |
| **Carousels** | Ferris Wheel, Wheel Carousel, Looped Tabs With Perspective, Small Carousel, Horizontal Carousel Perspective |
| **Interactive galleries** | Cursor Trail, Dolphin Animation, Endless Parallax |

### "Tell a story as the user scrolls" — 8 animations

Sequential, narrative content reveal tied to scroll progress.

- Classic Horizontal Scroll
- Expanding Horizontal Scroll
- Window Scroll
- Horizontal & Vertical Scroll
- Aura Stack
- Editorial Text Reveal
- Corner Fold Scroll
- Book Animation

### "Make a striking hero section" — 7 animations

Designed to be the first thing a user sees — full-screen, high impact.

- Tunnel Vision
- Shape Scroll
- Scroll 3D Animation
- Marquee Scroll Velocity
- Headline Images Overlay
- Mirror Mouse Track
- MantaRay (Breathing Gallery)

### "Present features / services" — 5 animations

Structured content (panels, cards) with expand/reveal on interaction.

- Accordion Scroll Horizontal
- Accordion Scroll Vertical
- IconText Pro Gallery
- Sticky Repeater Stack
- Title Folds Scroll

### "Display a deck of cards / items" — 5 animations

Card-metaphor animations for collections, portfolios, product highlights.

- Card Spread
- Card Spread By Hover
- Diagonal Shuffle
- Digital Jukebox
- Snake Animation

### "Build a navigation / wayfinding element" — 2 animations

Interactive elements that help users navigate content.

- Circular Scroll Nav
- Text Fold Transition

### "Add ambient / decorative motion" — 4 animations

Background motion that creates atmosphere without being the primary content.

- Horizontal Lanes
- Vertical Lanes
- Marquee Scroll Velocity
- Endless Parallax

---

## Taxonomy 7: By Motion Character

*How the animation "feels" — its personality and rhythm. Useful for matching animation to brand mood.*

### Smooth & Elegant — 12 animations

Fluid transitions, gentle easing, unhurried reveals.

- Accordion Scroll Horizontal
- Accordion Scroll Vertical
- Blur Focus Gallery
- Classic Horizontal Scroll
- Text Fold Transition
- Sticky Repeater Stack
- Aura Stack
- Editorial Text Reveal
- Mirror Mouse Track
- Horizontal Lanes
- Vertical Lanes
- Headline Images Overlay

### Mechanical & Precise — 8 animations

Rigid, geometric motion — rotation on axes, precise positioning, mathematical paths.

- Ferris Wheel
- Wheel Carousel
- Digital Jukebox
- Scroll 3D Animation
- Circular Scroll Nav
- Horizontal Carousel Perspective
- Window Scroll
- Looped Tabs With Perspective

### Playful & Organic — 10 animations

Bouncy, surprising, or nature-inspired motion with personality.

- Cursor Trail
- Dolphin Animation
- Snake Animation
- MantaRay (Breathing Gallery)
- Card Spread
- Card Spread By Hover
- Diagonal Shuffle
- Endless Parallax
- Shape Scroll
- Paragraph Reveal

### Dramatic & Theatrical — 8 animations

Big, cinematic gestures — zooms, folds, depth reveals.

- Expanding Horizontal Scroll
- Corner Fold Scroll
- Title Folds Scroll
- Book Animation
- Tunnel Vision
- Scroll 3D Animation
- Aura Stack (also smooth, but the depth layering is theatrical)
- Horizontally Scrolling Gallery

### Reactive & Alive — 6 animations

Animations that feel "alive" because they directly mirror user input.

- 3D Parallax Gallery
- Rotating Gallery Grid
- Mirror Mouse Track
- Tunnel Vision
- Mouse Track Infinite Gallery
- Marquee Scroll Velocity (velocity-responsive)

---

## Taxonomy 8: By Technical Complexity / Implementation Difficulty

*How hard each animation is to build from scratch. Useful for estimating effort and choosing which patterns to learn first.*

### Beginner (1–2 interact calls, simple keyframes) — 10 animations

| Animation | Why it's simple |
|-----------|----------------|
| Blur Focus Gallery | Single hover effect per card |
| Mirror Hover Gallery | Hover scale + overlay |
| Accordion Scroll Horizontal | CSS transition + interact hover trigger |
| Accordion Scroll Vertical | Same as above, vertical |
| IconText Pro Gallery | Same accordion pattern |
| Horizontal Lanes | Simple translateX loop |
| Vertical Lanes | Simple translateY loop |
| Marquee Scroll Velocity | TranslateX loop + velocity physics layer |
| Headline Images Overlay | Opacity keyframes with sequenced offsets |
| Text Fold Transition | TranslateY swap with stagger |

### Intermediate (3–5 interact calls, scroll timing) — 19 animations

| Animation | Key challenge |
|-----------|--------------|
| Card Spread | Staggered scroll ranges per card |
| Card Spread By Hover | Multi-card translateX choreography |
| Classic Horizontal Scroll | Multi-panel translateX with clipPath |
| Sticky Repeater Stack | Dynamic range computation from gap/speed |
| Title Folds Scroll | Scale + heading scale + line reveal stagger |
| Diagonal Shuffle | Per-card angle + stagger calculation |
| Shape Scroll | ClipPath interpolation between shapes |
| Corner Fold Scroll | Inset clip + translateY stagger |
| Window Scroll | RotateX/translateZ per panel |
| 3D Parallax Gallery | Pointer tracking + hover reveal |
| Rotating Gallery Grid | Pointer tracking + movement cap |
| Mirror Mouse Track | Tilt3DMouse with mobile fallback |
| Ferris Wheel | Ring rotation + counter-rotation |
| Wheel Carousel | Same ring pattern |
| MantaRay | Breathing loop + hover scale + stagger |
| Looped Tabs With Perspective | Marquee + hover straighten |
| Aura Stack | Multi-layer depth stagger |
| Editorial Text Reveal | Multi-section slide choreography |
| Paragraph Reveal | Dynamic image mask positioning |

### Advanced (complex choreography, custom JS, state machines) — 15 animations

| Animation | Key challenge |
|-----------|--------------|
| Expanding Horizontal Scroll | Multi-stage scroll with zoom + title letter stagger |
| Horizontal & Vertical Scroll | Multi-axis card movement, responsive recalc |
| Horizontal Carousel Perspective | 3D positioning math + dynamic title swap |
| Digital Jukebox | 3D totem with info panel sync |
| Scroll 3D Animation | Orbiting text + central rotation choreography |
| Book Animation | 3D rotateY page flips with shadow CSS vars |
| Circular Scroll Nav | Circular placement math + scroll rotation + hover |
| Small Carousel | 3D carousel state machine + fly-out modal |
| Endless Parallax | Random tile placement + click modal + physics drift |
| Snake Animation | Sine-wave positioning + click convergence + image cycling |
| Cursor Trail | Spawn-on-move with distance tracking + randomization |
| Dolphin Animation | Particle physics with arc trajectories |
| Mouse Track Infinite Gallery | Velocity/damping physics + parallax layers |
| Tunnel Vision | Layered text with pointer-driven translate3d + scale per layer |
| Horizontally Scrolling Gallery | ClipPath + rotation + GSAP scroll integration |

---

## Taxonomy 9: By Production Readiness

*How close each animation is to being dropped into a real client site without modification.*

### Ship-Ready — 14 animations

Works out of the box, responsive, accessible enough, no rough edges.

- Accordion Scroll Horizontal
- Accordion Scroll Vertical
- Blur Focus Gallery
- Mirror Hover Gallery
- Classic Horizontal Scroll
- Horizontal Lanes
- Vertical Lanes
- Sticky Repeater Stack
- Text Fold Transition
- Marquee Scroll Velocity
- IconText Pro Gallery
- Headline Images Overlay
- Card Spread
- Card Spread By Hover

### Needs Minor Polish — 15 animations

Functional but may need responsive tweaks, edge-case fixes, or content adaptation.

- Window Scroll
- Expanding Horizontal Scroll
- Horizontal & Vertical Scroll
- Title Folds Scroll
- Diagonal Shuffle
- Shape Scroll
- Looped Tabs With Perspective
- 3D Parallax Gallery
- Rotating Gallery Grid
- Mirror Mouse Track
- MantaRay (Breathing Gallery)
- Aura Stack
- Editorial Text Reveal
- Ferris Wheel
- Wheel Carousel

### Showcase / Experimental — 15 animations

Impressive demos that require significant adaptation for production use.

- Cursor Trail
- Dolphin Animation
- Snake Animation
- Endless Parallax
- Mouse Track Infinite Gallery
- Tunnel Vision
- Scroll 3D Animation
- Horizontal Carousel Perspective
- Digital Jukebox
- Book Animation
- Circular Scroll Nav
- Corner Fold Scroll
- Small Carousel
- Paragraph Reveal
- Horizontally Scrolling Gallery

---

## Cross-Taxonomy Cheat Sheet

Quick lookup for any animation across all 9 lenses.

| # | Animation | Trigger | Layout | Content | Wow Level | Dimensionality | Intent | Motion | Difficulty | Readiness |
|---|-----------|---------|--------|---------|-----------|---------------|--------|--------|------------|-----------|
| 1 | 3D Parallax Gallery | pointer-tilt | Grid | Image | Polished | 2.5D | Portfolio | Reactive | Intermediate | Minor Polish |
| 2 | Accordion Scroll H | hover-accordion | H-Strip | Image | Subtle | 2D | Features | Smooth | Beginner | Ship-Ready |
| 3 | Accordion Scroll V | hover-accordion | V-Stack | Image | Subtle | 2D | Features | Smooth | Beginner | Ship-Ready |
| 4 | Blur Focus Gallery | hover-gallery | Grid | Image | Subtle | 2D | Portfolio | Smooth | Beginner | Ship-Ready |
| 5 | Card Spread | scroll-card-stack | Layered | Image | Polished | 2.5D | Card Deck | Playful | Intermediate | Ship-Ready |
| 6 | Card Spread By Hover | hover-card-spread | Layered | Image | Polished | 2.5D | Card Deck | Playful | Intermediate | Ship-Ready |
| 7 | Classic Horizontal Scroll | scroll-storytelling | H-Strip | Mixed | Polished | 2D | Storytelling | Smooth | Intermediate | Ship-Ready |
| 8 | Corner Fold Scroll | scroll-shape-morph | V-Stack | Mixed | Bold | 2.5D | Storytelling | Dramatic | Intermediate | Showcase |
| 9 | Cursor Trail | pointer-trail | Free-form | Image | Wild | 2D | Portfolio | Playful | Advanced | Showcase |
| 10 | Diagonal Shuffle | scroll-card-stack | Grid | Image | Polished | 2.5D | Card Deck | Playful | Intermediate | Minor Polish |
| 11 | Digital Jukebox | scroll-3d | V-Stack | Mixed | Bold | Full 3D | Card Deck | Mechanical | Advanced | Showcase |
| 12 | Dolphin Animation | pointer-trail | Free-form | Image | Wild | 2D | Portfolio | Playful | Advanced | Showcase |
| 13 | Endless Parallax | click-interaction | Free-form | Image | Wild | 2D | Ambient | Playful | Advanced | Showcase |
| 14 | Expanding H Scroll | scroll-storytelling | H-Strip | Mixed | Polished | Full 3D | Storytelling | Dramatic | Advanced | Minor Polish |
| 15 | Ferris Wheel | continuous-loop | Radial | Image | Bold | Full 3D | Portfolio | Mechanical | Intermediate | Minor Polish |
| 16 | Horizontal & Vertical | scroll-storytelling | H-Strip | Mixed | Polished | 2.5D | Storytelling | Smooth | Advanced | Minor Polish |
| 17 | Horizontal Carousel | scroll-3d | H-Strip | Image | Polished | Full 3D | Portfolio | Mechanical | Advanced | Showcase |
| 18 | Horizontal Lanes | parallax-lanes | H-Strip | Image | Subtle | 2D | Ambient | Smooth | Beginner | Ship-Ready |
| 19 | H Scrolling Gallery | hover-gallery | H-Strip | Image | Wild | Full 3D | Portfolio | Dramatic | Advanced | Showcase |
| 20 | Rotating Gallery Grid | pointer-tilt | Grid | Image | Polished | 2.5D | Portfolio | Reactive | Intermediate | Minor Polish |
| 21 | Looped Tabs w/ Perspective | continuous-loop | H-Strip | Mixed | Polished | 2.5D | Portfolio | Mechanical | Intermediate | Minor Polish |
| 22 | MantaRay | entrance-reveal | Grid | Image | Polished | 2D | Hero | Playful | Intermediate | Minor Polish |
| 23 | Mirror Hover Gallery | hover-gallery | Grid | Image | Subtle | 2D | Portfolio | Smooth | Beginner | Ship-Ready |
| 24 | Mouse Track Gallery | pointer-trail | H-Strip | Image | Wild | Full 3D | Portfolio | Reactive | Advanced | Showcase |
| 25 | Paragraph Reveal | scroll-text | V-Stack | Mixed | Polished | 2.5D | Storytelling | Playful | Intermediate | Showcase |
| 26 | Scroll 3D Animation | scroll-3d | Single | Mixed | Bold | Full 3D | Hero | Dramatic | Advanced | Showcase |
| 27 | Shape Scroll | scroll-shape-morph | Single | Image | Bold | 2.5D | Hero | Playful | Intermediate | Minor Polish |
| 28 | Small Carousel | click-interaction | Radial | Image | Bold | Full 3D | Card Deck | Mechanical | Advanced | Showcase |
| 29 | Snake Animation | click-interaction | Free-form | Image | Wild | 2D | Portfolio | Playful | Advanced | Showcase |
| 30 | Sticky Repeater Stack | scroll-card-stack | V-Stack | Image | Subtle | 2.5D | Features | Smooth | Intermediate | Ship-Ready |
| 31 | Title Folds Scroll | scroll-card-stack | V-Stack | Mixed | Polished | Full 3D | Features | Dramatic | Intermediate | Minor Polish |
| 32 | Vertical Lanes | parallax-lanes | V-Stack | Image | Subtle | 2D | Ambient | Smooth | Beginner | Ship-Ready |
| 33 | Wheel Carousel | continuous-loop | Radial | Image | Bold | Full 3D | Portfolio | Mechanical | Intermediate | Minor Polish |
| 34 | Window Scroll | scroll-storytelling | V-Stack | Mixed | Polished | 2.5D | Storytelling | Mechanical | Intermediate | Minor Polish |
| 35 | Aura Stack | scroll-text | Layered | Text | Bold | 2.5D | Storytelling | Smooth | Intermediate | Minor Polish |
| 36 | Book Animation | scroll-text | Single | Mixed | Bold | Full 3D | Storytelling | Dramatic | Advanced | Showcase |
| 37 | Circular Scroll Nav | scroll-text | Radial | Text | Bold | Full 3D | Navigation | Mechanical | Advanced | Showcase |
| 38 | Editorial Text Reveal | scroll-text | Layered | Mixed | Polished | 2.5D | Storytelling | Smooth | Intermediate | Minor Polish |
| 39 | Headline Images Overlay | entrance-reveal | Layered | Mixed | Subtle | 2D | Hero | Smooth | Beginner | Ship-Ready |
| 40 | IconText Pro Gallery | hover-accordion | H-Strip | Mixed | Subtle | 2D | Features | Smooth | Beginner | Ship-Ready |
| 41 | Marquee Scroll Velocity | continuous-loop | H-Strip | Text | Subtle | 2D | Ambient | Smooth | Beginner | Ship-Ready |
| 42 | Mirror Mouse Track | pointer-tilt | Layered | Text | Polished | 2.5D | Hero | Reactive | Intermediate | Minor Polish |
| 43 | Text Fold Transition | scroll-text | V-Stack | Text | Subtle | 2D | Navigation | Smooth | Beginner | Ship-Ready |
| 44 | Tunnel Vision | pointer-tilt | Layered | Text | Wild | 2.5D | Hero | Reactive | Advanced | Showcase |

---

## Distribution Summary

| Taxonomy | Top Category | Count | % |
|----------|-------------|-------|---|
| Trigger | Scroll-driven | 19 | 43% |
| Layout | Horizontal Strip | 10 | 23% |
| Content | Image-only | 26 | 59% |
| Wow Factor | Polished & Engaging | 16 | 36% |
| Dimensionality | 2D Flat | 17 | 39% |
| User Intent | Portfolio/Gallery | 16 | 36% |
| Motion Character | Smooth & Elegant | 12 | 27% |
| Difficulty | Intermediate | 19 | 43% |
| Readiness | Needs Minor Polish | 15 | 34% |

The collection skews toward **scroll-driven, image-focused, intermediate-complexity** animations at a **polished engagement level** — which aligns well with the typical use case of modern marketing and portfolio sites.
