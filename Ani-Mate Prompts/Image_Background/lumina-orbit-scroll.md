 {
    "id": "lumina-orbit-scroll",
    "name": "Lumina Orbit Scroll",
    "description": "A single large image stays pinned, then shrinks into a tilted luminous card and fades away through scroll.",
    "targetShape": "Best for one dominant hero image or media surface, optionally with centered overlay copy above it.",
    "selectorContract": [
      "Role ownership is strict: scrollSection owns runway, stickyFrame owns sticky/clipping, and primaryImage owns the transform/filter animation.",
      "Animate only the dominant image/media root. Do not bind the transform to stickyFrame or to a wrapper that also contains copy.",
      "In Wix, stickyFrame is usually the internal-container-root and primaryImage should be the concrete image comp or stable image-only wrapper inside it.",
      "Use viewport units only for the runway and sticky frame. Recompute runway height from the desired pacing instead of copying the demo number."
    ],
    "roleGuidance": {
      "scrollSource": "Tall section whose viewProgress drives the image orbit.",
      "stickyFrame": "Pinned viewport-sized frame that centers and clips the large image.",
      "primaryImage": "The single large image or image-only media wrapper that receives the transform/filter sequence."
    },
    "adaptationNotes": [
      "Keep the source image sizing model unless the image needs explicit stage fill; `width/height: 100%` with `object-fit: cover` is the normal baseline.",
      "If the section has overlay copy, leave it static or animate it separately with its own selector.",
      "Use the image root or image-only wrapper as primaryImage so text does not shrink and tilt with the image.",
      "If the image should not disappear fully, stop the last keyframe earlier instead of copying the demo fade-out literally."
    ],
    "requiredElements": [
      { "key": "scrollSection", "role": "scrollSource", "demoSelector": ".sticky-track" },
      { "key": "stickyFrame", "role": "stickyFrame", "demoSelector": "#sticky-frame" },
      { "key": "primaryImage", "role": "primaryImage", "demoSelector": "#hero-image" }
    ],
    "requiredStyles": [
      {
        "targetRole": "scrollSource",
        "declarations": { "position": "relative", "minHeight": "500vh" }
      },
      {
        "targetRole": "stickyFrame",
        "declarations": {
          "position": "sticky",
          "top": "0",
          "height": "100vh",
          "display": "flex",
          "alignItems": "center",
          "justifyContent": "center",
          "overflow": "clip"
        }
      },
      {
        "targetRole": "primaryImage",
        "declarations": {
          "display": "block",
          "width": "100vw",
          "height": "100vh",
          "objectFit": "cover",
          "willChange": "transform, filter, opacity, border-radius"
        }
      }
    ],
    "interactionRecipe": {
      "trigger": "viewProgress",
      "target": "scrollSection",
      "effects": [
        {
          "key": "primaryImage",
          "kind": "imageOrbitAway",
          "rangeStart": "contain 0%",
          "rangeEnd": "contain 100%",
          "keyframeSummary": [
            "start: slightly enlarged full-stage image",
            "mid: shrink into tilted luminous card",
            "end: tiny desaturated faded image"
          ],
          "notes": "Scale, 3D tilt, border radius, filter, and opacity all evolve together."
        }
      ]
    }
  }