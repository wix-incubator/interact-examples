# Dropdown.html: CSS Transitions That Cannot Be Converted to @wix/interact

**File**: `interact-UI-elements/dropdown.html`

## Summary

The dropdown has 3 CSS transitions that cannot be converted to `@wix/interact`. All three are driven by the `.open` class on the `.dropdown` container, which is toggled by **four different mechanisms**:

1. Click on trigger button (toggle open/close)
2. Click outside the dropdown (close)
3. Escape key (close)
4. Option selection (close)

Interact's `click` trigg
er with `method: 'toggle'` only handles mechanism #1. The other three close paths are JS-driven and have no interact equivalent. If interact managed the visual state, its internal toggle would desync from the actual `.open` class when closing via outside-click, Escape, or selection — causing the animation to invert on the next click.

There is no programmatic API (e.g. `Interact.setState()`) to sync interact's state from external JS.

---

## 1. Chevron 180° Rotation

**Lines**: 66-77

```css
/* Line 71 */
.chevron {
  transition: transform 300ms ease;
}

/* Lines 74-77 */
.dropdown.open .chevron {
  color: #ffd782;
  transform: rotate(180deg);
}
```

**What it does**: Rotates the chevron arrow 180° when the dropdown opens, and back to 0° when it closes.

**Why it can't be converted**: The rotation must reverse on all four close mechanisms listed above, not just click toggle.

---

## 2. Dropdown Menu Appear/Disappear

**Lines**: 79-100

```css
/* Lines 87-93 */
.dropdown-menu {
  opacity: 0;
  visibility: hidden;
  transform: translateX(-50%) translateY(-6px);
  transition: opacity 220ms ease, visibility 220ms ease, transform 220ms ease;
}

/* Lines 96-100 */
.dropdown.open .dropdown-menu {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}
```

**What it does**: Fades in the menu, makes it visible, and slides it up 6px when opening. Reverses on close.

**Why it can't be converted**: Same multi-source close trigger issue. Additionally, the `visibility` property toggle (hidden/visible) is essential for accessibility (preventing tab focus on hidden items) and works in concert with `opacity` — interact's TransitionEffect would need to coordinate both properties across all close paths.

---

## 3. Option Staggered Fade-In

**Lines**: 116-144

```css
/* Lines 116-120 — per-item delay index */
.dropdown-menu > interact-element { --i: 0; }
.dropdown-menu > interact-element:nth-child(2) { --i: 1; }
.dropdown-menu > interact-element:nth-child(3) { --i: 2; }
.dropdown-menu > interact-element:nth-child(4) { --i: 3; }
.dropdown-menu > interact-element:nth-child(5) { --i: 4; }

/* Lines 138-144 */
.dropdown-option {
  opacity: 0;
  transition: opacity 220ms ease-out calc(var(--i) * 45ms);
}

.dropdown.open .dropdown-option {
  opacity: 1;
}
```

**What it does**: Each option fades in with a staggered delay (0ms, 45ms, 90ms, 135ms, 180ms) when the dropdown opens. All fade out simultaneously on close.

**Why it can't be converted**: Same multi-source close trigger issue. While interact's `sequences` feature with `offset` could express the stagger timing, the triggering mechanism (`.open` class from four sources) cannot be represented in interact's declarative config.
