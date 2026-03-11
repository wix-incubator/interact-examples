# Animation Slider Analysis

> Generated from 44 animations across the explorer, totalling 211 individual sliders.

---

## At a Glance

| Metric | Value |
|--------|-------|
| Total animations | 44 |
| Total sliders | 211 |
| Average sliders per animation | 4.8 |
| Unique slider names | 99 |
| Slider families (groups of similar sliders) | 17 |
| Animation-tab sliders | 80 (38%) |
| Layout-tab sliders | 131 (62%) |

Most animations lean heavier on layout controls than animation controls — the typical split is ~2 animation sliders and ~3 layout sliders per animation.

---

## Slider Families

When you normalize similar slider names (e.g. "Card Border Radius", "Panel Border Radius", and "Image Border Radius" are all fundamentally **Border Radius** controls), the 99 unique names collapse into **17 families**.

| Family | Count | % of all sliders | Examples |
|--------|------:|:----------------:|----------|
| Width / Height | 38 | 18.0% | Card Width, Panel Height, Open Width, Content Max Width |
| Border Radius | 33 | 15.6% | Card Border Radius, Panel Border Radius, Image Border Radius |
| Speed | 31 | 14.7% | Animation Speed, Panel Speed, Lane Speed, Marquee Speed |
| Gap / Spacing | 29 | 13.7% | Grid Gap, Panel Gap, Image Padding, Column Gap |
| Typography | 18 | 8.5% | Font Size, Main Title Size, Stroke Width, Letter Spacing |
| Size / Scale | 15 | 7.1% | Ring Size, Tile Size, Hover Size, Zoom Level |
| Perspective | 7 | 3.3% | Perspective |
| Direction | 6 | 2.8% | Direction, Rotation Direction |
| Angle / Tilt | 6 | 2.8% | Tilt Angle, Max Rotation, Card Rotation |
| Density / Count | 5 | 2.4% | Density, Image Count |
| Pointer Latency | 4 | 1.9% | Pointer Latency |
| Stagger | 4 | 1.9% | Stagger, Entrance Stagger, Gap / Stagger |
| Visual Effect | 4 | 1.9% | Blur Intensity, Parallax Depth, Image Grayscale |
| Spread | 2 | 0.9% | Spread Distance |
| Timing | 2 | 0.9% | Pop Duration |
| Hover Effect | 2 | 0.9% | Hover Shift, Hover Shape |
| Unique | 2 | 0.9% | Fold Point, Reveal Shape |

**The big four families — Width/Height, Border Radius, Speed, and Gap/Spacing — account for 62% of all sliders.** These are the universal building blocks of animation customization.

---

## Most Common Exact Slider Names

These are sliders with the exact same label appearing across multiple animations:

| Slider Name | Appearances | Tab |
|-------------|:-----------:|-----|
| Animation Speed | 17 | Animation |
| Card Border Radius | 13 | Layout |
| Perspective | 7 | Layout (5) / Animation (2) |
| Panel Border Radius | 6 | Layout |
| Image Border Radius | 6 | Layout |
| Card Width | 5 | Layout |
| Pointer Latency | 4 | Animation |
| Direction | 4 | Animation |
| Grid Gap | 4 | Layout |
| Border Radius | 4 | Layout |
| Card Height | 4 | Layout |
| Panel Speed | 3 | Animation |
| Panel Gap | 3 | Layout |
| Panel Default Width | 3 | Layout |
| Panel Default Height | 3 | Layout |
| Blur Intensity | 3 | Animation |
| Panel Width | 3 | Layout |
| Panel Height | 3 | Layout |
| Image Size | 3 | Layout |
| Font Size | 3 | Layout |
| Content Max Width | 3 | Layout |

**"Animation Speed" is the single most common slider**, appearing in 17 of 44 animations (39%). After that, **"Card Border Radius"** is the most universal layout control at 13 animations (30%).

---

## The Speed Slider Landscape

Speed is the #1 animation control. There are 9 different speed slider names across the collection:

| Speed Variant | Count | Used by |
|---------------|:-----:|---------|
| Animation Speed | 17 | Card Spread, Classic Horizontal Scroll, Corner Fold Scroll, Diagonal Shuffle, Endless Parallax, Expanding Horizontal Scroll, Horizontal & Vertical Scroll, Paragraph Reveal, Scroll 3D Animation, Shape Scroll, Snake Animation, Title Folds Scroll, Window Scroll, Aura Stack, Editorial Text Reveal, Headline Images Overlay, Text Fold Transition |
| Panel Speed | 3 | Accordion Scroll Horizontal, Accordion Scroll Vertical, IconText Pro Gallery |
| Lane Speed | 2 | Horizontal Lanes, Vertical Lanes |
| Rotation Speed | 2 | Ferris Wheel, Wheel Carousel |
| Marquee Speed | 2 | Looped Tabs With Perspective, Marquee Scroll Velocity |
| Scroll Speed | 2 | Horizontally Scrolling Gallery, Sticky Repeater Stack |
| Breathing Speed | 1 | Breathing Gallery (MantaRay) |
| Hover Speed | 1 | Horizontally Scrolling Gallery |
| Gallery Speed | 1 | Mouse Track Infinite Gallery |

The naming tends to reflect the interaction type — scroll-driven animations say "Animation Speed" or "Scroll Speed", continuous loops say "Rotation Speed" or "Marquee Speed", and hover-based animations say "Panel Speed" or "Hover Speed".

---

## The Border Radius Family

Border radius is the most popular layout slider family (33 total). The naming reflects what's being rounded:

| Variant | Count |
|---------|:-----:|
| Card Border Radius | 13 |
| Panel Border Radius | 6 |
| Image Border Radius | 6 |
| Border Radius (generic) | 4 |
| Tile Border Radius | 2 |
| Page Border Radius | 1 |
| Item Border Radius | 1 |

**Every single border radius slider lives in the Layout tab.** This makes sense — rounding corners is a layout/styling decision, not an animation parameter.

---

## Animations by Slider Count

| Sliders | Animations |
|:-------:|:-----------|
| 9 | Aura Stack |
| 8 | Editorial Text Reveal |
| 6 | 3D Parallax Gallery, Accordion Scroll Horizontal, Accordion Scroll Vertical, Breathing Gallery (MantaRay), IconText Pro Gallery, Rotating Gallery Grid, Snake Animation |
| 5 | Card Spread, Classic Horizontal Scroll, Cursor Trail, Digital Jukebox, Dolphin Animation, Ferris Wheel, Headline Images Overlay, Horizontal & Vertical Scroll, Horizontal Carousel Perspective, Horizontally Scrolling Gallery, Mirror Mouse Track, Mouse Track Infinite Gallery, Paragraph Reveal, Shape Scroll, Title Folds Scroll, Tunnel Vision, Wheel Carousel, Window Scroll |
| 4 | Card Spread By Hover, Circular Scroll Nav, Diagonal Shuffle, Endless Parallax, Horizontal Lanes, Looped Tabs With Perspective, Marquee Scroll Velocity, Mirror Hover Gallery, Scroll 3D Animation, Small Carousel, Vertical Lanes |
| 3 | Blur Focus Gallery, Book Animation, Corner Fold Scroll, Expanding Horizontal Scroll, Sticky Repeater Stack, Text Fold Transition |

The **most customizable** animation is Aura Stack with 9 sliders. The **least customizable** have just 3 sliders each (Blur Focus Gallery, Book Animation, Corner Fold Scroll, Expanding Horizontal Scroll, Sticky Repeater Stack, Text Fold Transition).

---

## Animations With No Animation-Tab Sliders

Three animations have **only layout controls** and no animation-behavior sliders:

1. **Book Animation** — Perspective, Page Border Radius, Page Padding
2. **Digital Jukebox** — Perspective, Item Border Radius, Item Width, Item Height, Item Spacing
3. **Small Carousel** — Card Width, Card Height, Card Border Radius, Card Border Width

These are either heavily layout-driven (Jukebox, Small Carousel) or have animation behavior that's hard to parameterize (Book page-flip physics).

---

## Animation Tab vs Layout Tab Breakdown

| Tab | Slider count | Unique names | Most common |
|-----|:------------:|:------------:|-------------|
| Animation | 80 | 39 | Animation Speed (17), Pointer Latency (4), Direction (4) |
| Layout | 131 | 60 | Card Border Radius (13), Panel Border Radius (6), Image Border Radius (6) |

Layout sliders outnumber animation sliders roughly **1.6 to 1**. This reflects the reality that most animations have a small number of behavioral knobs (speed, direction) but many visual/layout properties to tweak (sizes, spacing, rounding, typography).

---

## Shared Slider Patterns Between Animations

Some animations share nearly identical slider setups, indicating they belong to the same interaction archetype:

### Accordion trio
**Accordion Scroll Horizontal**, **Accordion Scroll Vertical**, and **IconText Pro Gallery** all share: Panel Speed, Open Width/Height, Panel Border Radius, Panel Gap, Panel Default Width, Panel Default Height.

### Card Spread pair
**Card Spread** and **Card Spread By Hover** both have: Spread Distance, Card Rotation, Card Border Radius, Card Width.

### Wheel / Ferris pair
**Ferris Wheel** and **Wheel Carousel** both have: Rotation Speed, Rotation Direction, (Tile/Card) Border Radius, Ring Size, (Tile/Card) Size.

### Lane pair
**Horizontal Lanes** and **Vertical Lanes** share: Lane Speed, Image Border Radius, Image Padding — differing only in the third layout slider (Row Height vs Column Width).

### Pointer-tilt quad
**3D Parallax Gallery**, **Rotating Gallery Grid**, **Mirror Mouse Track**, and **Tunnel Vision** share: Pointer Latency, Direction — the hallmark of pointer-tracking animations.

### Particle trail pair
**Cursor Trail** and **Dolphin Animation** share: Pop Duration, Density, Gap / Stagger, Image Size, Border Radius — identical slider set.

### Editorial text pair
**Aura Stack** and **Editorial Text Reveal** share 7 layout sliders with identical names: Main Title Size, Section Heading Size, Heading Letter Spacing, Featured Text Size, Column Gap, Background Number Size, Content Max Width.

---

## Unique One-Off Sliders

These sliders appear in exactly one animation, representing specialized controls:

| Slider | Animation | What it does |
|--------|-----------|-------------|
| Fold Point | Corner Fold Scroll | Where the fold crease splits |
| Reveal Shape | Shape Scroll | Shape of the clip-path morph |
| Hover Shape | Horizontally Scrolling Gallery | Clip-path shape on hover (circle/ellipse) |
| Zoom Level | Expanding Horizontal Scroll | Image zoom multiplier |
| Wave Amplitude | Snake Animation | How wavy the snake path is |
| Parallax Range | Tunnel Vision | Depth of the parallax layers |
| Image Grayscale | Headline Images Overlay | B&W filter intensity |
| Card Entry Scale | Title Folds Scroll | Initial card scale before fold-in |
| Card Border Width | Small Carousel | Outline thickness |
| 3D Depth | Horizontal Carousel Perspective | Z-axis push distance |
| Hover Shift | Circular Scroll Nav | How far items shift on hover |
| Image Overlap | Breathing Gallery (MantaRay) | How much images stack over each other |
| Mask Scale | Headline Images Overlay | Size of the image masks |

These tend to be **animation-specific behaviors** that don't generalize to other interactions.

---

## Key Takeaways

1. **Border radius is king of layout.** If you're building a new animation and want the most impactful layout slider, add border radius.

2. **Speed is the universal animation knob.** 41 of 44 animations (93%) have at least one speed-like slider. The three exceptions (Book Animation, Digital Jukebox, Small Carousel) are click/layout-focused.

3. **The "core four" families cover 62% of all sliders** — Width/Height, Border Radius, Speed, Gap/Spacing. A new animation can get solid customization coverage with just these four.

4. **Pointer-tracking animations share a distinctive fingerprint** — Pointer Latency + Direction always travel together (4 animations).

5. **Animations naturally cluster into archetypes** with shared slider DNA — accordion panels, card spreads, wheels, lanes, pointer-tilts, particle trails, and editorial text layouts.

6. **Layout sliders outnumber animation sliders 1.6:1** — most of the "customization surface area" of any animation is in its visual/layout properties, not its motion parameters.

7. **Typography sliders are concentrated** in the Typographic_interactions directory (Aura Stack, Editorial Text Reveal, Marquee Scroll Velocity, Tunnel Vision) but occasionally appear in Gallery-and-Carousel animations too (Paragraph Reveal).
