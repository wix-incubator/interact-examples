var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience-renderer/src/pipeline/conditions.ts
function evaluateConditions(conditions, onChange) {
  if (!conditions || conditions.length === 0 || typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return { disabled: false, cleanup: () => {
    } };
  }
  const mqls = conditions.map((c) => window.matchMedia(c.mediaQuery));
  let disabled = mqls.some((m) => m.matches);
  const handler = () => {
    const next = mqls.some((m) => m.matches);
    if (next !== disabled) {
      disabled = next;
      onChange(disabled);
    }
  };
  for (const mql of mqls) {
    mql.addEventListener("change", handler);
  }
  return {
    get disabled() {
      return disabled;
    },
    cleanup() {
      for (const mql of mqls) {
        mql.removeEventListener("change", handler);
      }
    }
  };
}

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience/src/resolve/transforms.ts
function applyTransform(value, transform) {
  if (!transform || transform.type === "direct") return value;
  switch (transform.type) {
    case "linear": {
      if (typeof value !== "number") return value;
      return transform.factor * value + (transform.offset ?? 0);
    }
    case "inverse": {
      if (typeof value !== "number" || value === 0) return value;
      return transform.numerator / value;
    }
    case "map": {
      const key = String(value);
      return key in transform.entries ? transform.entries[key] : value;
    }
    case "template": {
      return transform.template.replaceAll("${value}", String(value));
    }
  }
}

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience/src/resolve/path.ts
function splitPath(path) {
  return path.split(".").filter((s) => s.length > 0).map((s) => /^\d+$/.test(s) ? Number(s) : s);
}
function setPath(obj, path, value) {
  const segments = splitPath(path);
  if (segments.length === 0 || obj === null || typeof obj !== "object") return;
  let target = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const next = target[seg];
    if (next === null || typeof next !== "object") {
      const created = typeof segments[i + 1] === "number" ? [] : {};
      target[seg] = created;
      target = created;
    } else {
      target = next;
    }
  }
  target[segments[segments.length - 1]] = value;
}

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience/src/resolve/resolve.ts
function resolveTarget(experience, target, targetId) {
  switch (target) {
    case "element":
      return experience.elements[targetId];
    case "effect":
      return experience.interact.effects[targetId];
    case "sequence":
      return experience.interact.sequences?.[targetId];
    case "style":
      return (experience.styles ?? []).find((s) => s.selector === targetId);
    case "interaction":
      return experience.interact.interactions.find((i) => i.id === targetId);
    case "variable":
      return null;
  }
}
function resolveExperience(experience, userValues) {
  const resolved = structuredClone(experience);
  const variables = {};
  for (const control of resolved.controls) {
    const value = userValues[control.id] ?? control.defaultValue;
    for (const binding of control.bindings) {
      const final = applyTransform(value, binding.transform);
      if (binding.target === "variable") {
        if (typeof final === "boolean") variables[binding.targetId] = String(final);
        else variables[binding.targetId] = final;
        continue;
      }
      const target = resolveTarget(resolved, binding.target, binding.targetId);
      if (target && binding.property) {
        setPath(target, binding.property, final);
      }
    }
  }
  return { experience: resolved, variables };
}

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience-renderer/src/pipeline/resolve.ts
function resolveControls(experience, options) {
  if (options.store) return options.store.resolved();
  return resolveExperience(experience, options.controlValues ?? {});
}

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience-renderer/src/pipeline/elements.ts
function selectElements(elements, root) {
  const map = /* @__PURE__ */ new Map();
  for (const [key, entry] of Object.entries(elements)) {
    const nodes = Array.from(root.querySelectorAll(entry.selector));
    for (const el of nodes) {
      el.dataset.interactKey = key;
    }
    map.set(key, nodes);
  }
  return map;
}
function clearElementAttributes(elements) {
  for (const nodes of elements.values()) {
    for (const el of nodes) {
      delete el.dataset.interactKey;
    }
  }
}

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience-renderer/src/pipeline/styles.ts
var supportsAdoptedStyleSheets = typeof CSSStyleSheet !== "undefined" && "replaceSync" in CSSStyleSheet.prototype && typeof document !== "undefined" && "adoptedStyleSheets" in document;
function buildStylesheetText(resolved, scopeId, variableNames = /* @__PURE__ */ new Set()) {
  const scope = `[data-experience-id="${scopeId}"]`;
  const sections = [];
  const declarations = (styles) => Object.entries(styles).filter(([prop]) => !variableNames.has(prop)).map(([prop, val]) => `  ${prop}: ${val};`).join("\n");
  for (const [key, entry] of Object.entries(resolved.elements)) {
    if (!entry.styles || Object.keys(entry.styles).length === 0) continue;
    const props = declarations(entry.styles);
    if (!props) continue;
    if (entry.selector.includes("::")) {
      sections.push(`${scope} ${entry.selector} {
${props}
}`);
    } else {
      sections.push(`${scope} [data-interact-key="${key}"] {
${props}
}`);
    }
  }
  if (resolved.styles) {
    for (const rule of resolved.styles) {
      const ruleSelector = `${scope} ${rule.selector}`;
      const props = declarations(rule.properties);
      if (!props) continue;
      if (rule.mediaQuery) {
        sections.push(`@media ${rule.mediaQuery} {
  ${ruleSelector} {
  ${props}
  }
}`);
      } else {
        sections.push(`${ruleSelector} {
${props}
}`);
      }
    }
  }
  return sections.join("\n\n");
}
function applyVariables(scopeElement, variables) {
  const style = scopeElement.style;
  for (const [name, value] of Object.entries(variables)) {
    style.setProperty(name, String(value));
  }
}
function clearVariables(scopeElement, variables) {
  const style = scopeElement.style;
  for (const name of Object.keys(variables)) {
    style.removeProperty(name);
  }
}
function renderStyles(resolved, variables, scopeElement) {
  const scopeId = resolved.id;
  let currentVariables = { ...variables };
  const varNames = (vars) => new Set(Object.keys(vars));
  applyVariables(scopeElement, variables);
  if (supportsAdoptedStyleSheets) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(buildStylesheetText(resolved, scopeId, varNames(variables)));
    const root2 = scopeElement.getRootNode();
    root2.adoptedStyleSheets = [...root2.adoptedStyleSheets, sheet];
    return {
      update(newResolved, newVars) {
        sheet.replaceSync(buildStylesheetText(newResolved, scopeId, varNames(newVars)));
        applyVariables(scopeElement, newVars);
        currentVariables = { ...newVars };
      },
      setVariables(newVars) {
        applyVariables(scopeElement, newVars);
        currentVariables = { ...newVars };
      },
      destroy() {
        const r = scopeElement.getRootNode();
        r.adoptedStyleSheets = r.adoptedStyleSheets.filter((s) => s !== sheet);
        clearVariables(scopeElement, currentVariables);
      }
    };
  }
  const styleEl = document.createElement("style");
  styleEl.dataset.experienceId = scopeId;
  styleEl.textContent = buildStylesheetText(resolved, scopeId, varNames(variables));
  const root = scopeElement.getRootNode();
  (root.head ?? root).appendChild(styleEl);
  return {
    update(newResolved, newVars) {
      styleEl.textContent = buildStylesheetText(newResolved, scopeId, varNames(newVars));
      applyVariables(scopeElement, newVars);
      currentVariables = { ...newVars };
    },
    setVariables(newVars) {
      applyVariables(scopeElement, newVars);
      currentVariables = { ...newVars };
    },
    destroy() {
      styleEl.remove();
      clearVariables(scopeElement, currentVariables);
    }
  };
}

// ../../../Documents/Dev/Wix/interact-xp/node_modules/@wix/interact/dist/index-C6u4q815.mjs
function vt(t) {
  return [...t.matchAll(/\[([-\w]+)]/g)].map(([e, n]) => n);
}
function $(t, e) {
  const n = vt(e);
  let s = 0;
  return n.length ? t.replace(/\[]/g, () => {
    const i = n[s++];
    return i !== void 0 ? `[${i}]` : "[]";
  }) : t;
}
var V = class {
  animations;
  options;
  ready;
  isCSS;
  longestAnimation;
  constructor(e, n) {
    this.animations = e, this.options = n, this.ready = n?.measured || Promise.resolve(), this.isCSS = e[0] instanceof CSSAnimation, this.longestAnimation = this._getAnimationWithLongestEndTime();
  }
  _getAnimationWithLongestEndTime() {
    return this.animations.reduce((e, n) => {
      const s = e.effect?.getComputedTiming().endTime ?? 0, i = n.effect?.getComputedTiming().endTime ?? 0;
      return s > i ? e : n;
    }, this.animations[0]);
  }
  getProgress() {
    return this.longestAnimation?.effect?.getComputedTiming().progress || 0;
  }
  async play(e) {
    await this.ready;
    for (const n of this.animations)
      n.play();
    await Promise.all(this.animations.map((n) => n.ready)), e && e();
  }
  pause() {
    for (const e of this.animations)
      e.pause();
  }
  async reverse(e) {
    await this.ready;
    for (const n of this.animations)
      n.reverse();
    await Promise.all(this.animations.map((n) => n.ready)), e && e();
  }
  progress(e) {
    for (const n of this.animations) {
      const { delay: s, duration: i, iterations: r } = n.effect.getTiming(), o = (Number.isFinite(i) ? i : 0) * (Number.isFinite(r) ? r : 1);
      n.currentTime = ((s || 0) + o) * e;
    }
  }
  cancel() {
    for (const e of this.animations)
      e.cancel();
  }
  setPlaybackRate(e) {
    for (const n of this.animations)
      n.playbackRate = e;
  }
  async onFinish(e) {
    try {
      await Promise.all(this.animations.map((s) => s.finished));
      const n = this.animations[0];
      if (n && !this.isCSS) {
        const s = n.effect?.target;
        if (s) {
          const i = this.options?.effectId || n.id, r = new CustomEvent("animationend", { detail: { effectId: i } });
          s.dispatchEvent(r);
        }
      }
      e();
    } catch (n) {
      console.warn("animation was interrupted - aborting onFinish callback - ", n);
    }
  }
  async onAbort(e) {
    try {
      await Promise.all(this.animations.map((n) => n.finished));
    } catch (n) {
      if (n.name === "AbortError") {
        const s = this.animations[0];
        if (s && !this.isCSS) {
          const i = s.effect?.target;
          if (i) {
            const r = new Event("animationcancel");
            i.dispatchEvent(r);
          }
        }
        e();
      }
    }
  }
  get finished() {
    return Promise.all(this.animations.map((e) => e.finished));
  }
  get playState() {
    return this.animations.some((e) => e.playState === "running") ? "running" : this.animations[0]?.playState;
  }
  hasAnimationName(e) {
    return this.animations.some((n) => n.animationName === e);
  }
  hasAnimationId(e) {
    return this.animations.some((n) => n.id === e);
  }
  getTimingOptions() {
    return this.animations.map((e) => {
      const n = e.effect?.getTiming(), s = n?.delay ?? 0, i = Number(n?.duration) || 0, r = n?.iterations ?? 1;
      return {
        delay: s,
        duration: i,
        iterations: r
      };
    });
  }
};
var je = (t) => t;
var Et = (t) => 1 - Math.cos(t * Math.PI / 2);
var wt = (t) => Math.sin(t * Math.PI / 2);
var bt = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
var St = (t) => t ** 2;
var Tt = (t) => 1 - (1 - t) ** 2;
var It = (t) => t < 0.5 ? 2 * t ** 2 : 1 - (-2 * t + 2) ** 2 / 2;
var Ot = (t) => t ** 3;
var At = (t) => 1 - (1 - t) ** 3;
var Ct = (t) => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
var kt = (t) => t ** 4;
var $t = (t) => 1 - (1 - t) ** 4;
var _t = (t) => t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
var qt = (t) => t ** 5;
var Mt = (t) => 1 - (1 - t) ** 5;
var xt = (t) => t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
var Pt = (t) => t === 0 ? 0 : 2 ** (10 * t - 10);
var Lt = (t) => t === 1 ? 1 : 1 - 2 ** (-10 * t);
var Rt = (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
var Ft = (t) => 1 - Math.sqrt(1 - t ** 2);
var Nt = (t) => Math.sqrt(1 - (t - 1) ** 2);
var zt = (t) => t < 0.5 ? (1 - Math.sqrt(1 - 4 * t ** 2)) / 2 : (Math.sqrt(-(2 * t - 3) * (2 * t - 1)) + 1) / 2;
var Ht = (t) => 2.70158 * t ** 3 - 1.70158 * t ** 2;
var jt = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
var Dt = (t, e = 1.70158 * 1.525) => t < 0.5 ? (2 * t) ** 2 * ((e + 1) * 2 * t - e) / 2 : ((2 * t - 2) ** 2 * ((e + 1) * (t * 2 - 2) + e) + 2) / 2;
var Te = {
  linear: je,
  sineIn: Et,
  sineOut: wt,
  sineInOut: bt,
  quadIn: St,
  quadOut: Tt,
  quadInOut: It,
  cubicIn: Ot,
  cubicOut: At,
  cubicInOut: Ct,
  quartIn: kt,
  quartOut: $t,
  quartInOut: _t,
  quintIn: qt,
  quintOut: Mt,
  quintInOut: xt,
  expoIn: Pt,
  expoOut: Lt,
  expoInOut: Rt,
  circIn: Ft,
  circOut: Nt,
  circInOut: zt,
  backIn: Ht,
  backOut: jt,
  backInOut: Dt
};
var Ie = {
  linear: "linear",
  ease: "ease",
  easeIn: "ease-in",
  easeOut: "ease-out",
  easeInOut: "ease-in-out",
  sineIn: "cubic-bezier(0.47, 0, 0.745, 0.715)",
  sineOut: "cubic-bezier(0.39, 0.575, 0.565, 1)",
  sineInOut: "cubic-bezier(0.445, 0.05, 0.55, 0.95)",
  quadIn: "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
  quadOut: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  quadInOut: "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
  cubicIn: "cubic-bezier(0.55, 0.055, 0.675, 0.19)",
  cubicOut: "cubic-bezier(0.215, 0.61, 0.355, 1)",
  cubicInOut: "cubic-bezier(0.645, 0.045, 0.355, 1)",
  quartIn: "cubic-bezier(0.895, 0.03, 0.685, 0.22)",
  quartOut: "cubic-bezier(0.165, 0.84, 0.44, 1)",
  quartInOut: "cubic-bezier(0.77, 0, 0.175, 1)",
  quintIn: "cubic-bezier(0.755, 0.05, 0.855, 0.06)",
  quintOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  quintInOut: "cubic-bezier(0.86, 0, 0.07, 1)",
  expoIn: "cubic-bezier(0.95, 0.05, 0.795, 0.035)",
  expoOut: "cubic-bezier(0.19, 1, 0.22, 1)",
  expoInOut: "cubic-bezier(1, 0, 0, 1)",
  circIn: "cubic-bezier(0.6, 0.04, 0.98, 0.335)",
  circOut: "cubic-bezier(0.075, 0.82, 0.165, 1)",
  circInOut: "cubic-bezier(0.785, 0.135, 0.15, 0.86)",
  backIn: "cubic-bezier(0.6, -0.28, 0.735, 0.045)",
  backOut: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  backInOut: "cubic-bezier(0.68, -0.55, 0.265, 1.55)"
};
function Gt(t) {
  return t === "percentage" ? "%" : t || "px";
}
function J(t) {
  return t ? Ie[t] || t : Ie.linear;
}
function Wt(t, e, n, s) {
  const i = 3 * t, r = 3 * (n - t) - i, o = 1 - i - r, a2 = 3 * e, c = 3 * (s - e) - a2, l = 1 - a2 - c, f = (p) => ((o * p + r) * p + i) * p, u = (p) => ((l * p + c) * p + a2) * p, d = (p) => (3 * o * p + 2 * r) * p + i;
  function g(p) {
    let m = p;
    for (let y = 0; y < 8; y++) {
      const E = f(m) - p;
      if (Math.abs(E) < 1e-7) return m;
      const w2 = d(m);
      if (Math.abs(w2) < 1e-6) break;
      m -= E / w2;
    }
    let h2 = 0, v = 1;
    for (m = (h2 + v) / 2; v - h2 > 1e-7; ) {
      const y = f(m);
      if (Math.abs(y - p) < 1e-7) return m;
      p > y ? h2 = m : v = m, m = (h2 + v) / 2;
    }
    return m;
  }
  return (p) => p <= 0 ? 0 : p >= 1 ? 1 : u(g(p));
}
function Vt(t) {
  const e = t.match(
    /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/
  );
  if (!e) return;
  const n = parseFloat(e[1]), s = parseFloat(e[2]), i = parseFloat(e[3]), r = parseFloat(e[4]);
  if (![n, s, i, r].some(isNaN))
    return Wt(n, s, i, r);
}
function Yt(t) {
  const e = t.match(/^linear\((.+)\)$/);
  if (!e) return;
  const n = e[1].split(",").map((o) => o.trim()).filter(Boolean);
  if (n.length === 0) return;
  const s = [];
  for (const o of n) {
    const a2 = o.split(/\s+/), c = parseFloat(a2[0]);
    if (isNaN(c)) return;
    const l = [];
    for (let f = 1; f < a2.length; f++)
      if (a2[f].endsWith("%")) {
        const u = parseFloat(a2[f]) / 100;
        if (isNaN(u)) return;
        l.push(u);
      }
    l.length === 0 ? s.push({ output: c, pos: null }) : l.length === 1 ? s.push({ output: c, pos: l[0] }) : (s.push({ output: c, pos: l[0] }), s.push({ output: c, pos: l[1] }));
  }
  if (s.length === 0) return;
  s[0].pos === null && (s[0].pos = 0), s[s.length - 1].pos === null && (s[s.length - 1].pos = 1);
  let i = 0;
  for (; i < s.length; )
    if (s[i].pos === null) {
      const o = i - 1;
      let a2 = i;
      for (; a2 < s.length && s[a2].pos === null; ) a2++;
      const c = s[o].pos, l = s[a2].pos, f = a2 - o;
      for (let u = o + 1; u < a2; u++)
        s[u].pos = c + (l - c) * (u - o) / f;
      i = a2 + 1;
    } else
      i++;
  for (let o = 1; o < s.length; o++)
    s[o].pos < s[o - 1].pos && (s[o].pos = s[o - 1].pos);
  const r = s;
  return (o) => {
    if (o <= r[0].pos) return r[0].output;
    const a2 = r[r.length - 1];
    if (o >= a2.pos) return a2.output;
    let c = 0, l = r.length - 1;
    for (; c < l - 1; ) {
      const d = c + l >>> 1;
      r[d].pos <= o ? c = d : l = d;
    }
    const f = r[c], u = r[l];
    return u.pos === f.pos ? u.output : f.output + (u.output - f.output) * (o - f.pos) / (u.pos - f.pos);
  };
}
function be(t) {
  if (!t) return;
  const e = Te[t];
  return e || (Vt(t) ?? Yt(t) ?? Te.linear);
}
var Bt = class extends V {
  animationGroups;
  delay;
  offset;
  offsetEasing;
  timingOptions;
  constructor(e, n = {}) {
    const s = e.flatMap((i) => [...i.animations]);
    super(s), this.animationGroups = e, this.delay = n.delay ?? 0, this.offset = n.offset ?? 0, this.offsetEasing = typeof n.offsetEasing == "function" ? n.offsetEasing : be(n.offsetEasing) ?? je, this.timingOptions = this.animationGroups.map((i) => i.getTimingOptions().map(({ delay: r, duration: o, iterations: a2 }) => ({
      delay: r,
      duration: Number.isFinite(o) ? o : 0,
      iterations: Number.isFinite(a2) ? a2 : 1
    }))), this.applyOffsets(), this.ready = Promise.all(e.map((i) => i.ready)).then(() => {
    });
  }
  /**
   * Calculates stagger delay offsets for each animation group using the formula:
   *   easing(i / last) * last * offset
   * where i is the group index and last is the index of the final group.
   */
  calculateOffsets() {
    const e = this.animationGroups.length;
    if (e <= 1) return [0];
    const n = e - 1;
    return Array.from(
      { length: e },
      (s, i) => this.offsetEasing(i / n) * n * this.offset | 0
    );
  }
  applyOffsets() {
    if (this.animationGroups.length === 0 || this.animations.length === 0) return;
    const e = this.calculateOffsets(), n = this.getSequenceActiveDuration(e);
    this.animationGroups.forEach((s, i) => {
      s.animations.forEach((r, o) => {
        const a2 = r.effect;
        if (!a2) return;
        const { delay: c, duration: l, iterations: f } = this.timingOptions[i][o], u = c + e[i], d = n - (u + l * f);
        a2.updateTiming({ delay: u + this.delay, endDelay: d });
      });
    });
  }
  getSequenceActiveDuration(e) {
    const n = [];
    for (let s = 0; s < this.timingOptions.length; s++) {
      const i = this.timingOptions[s].reduce((r, o) => {
        if (!o) return r;
        const { delay: a2, duration: c, iterations: l } = o;
        return Math.max(r, a2 + c * l);
      }, 0);
      n.push(e[s] + i);
    }
    return Math.max(...n);
  }
  /**
   * Inserts new AnimationGroups at specified indices, then recalculates
   * stagger offsets for all groups. Each entry specifies the target index
   * in the animationGroups array where the group should be inserted.
   */
  addGroups(e) {
    if (e.length === 0) return;
    const n = [...e].sort((s, i) => i.index - s.index);
    for (const { index: s, group: i } of n) {
      const r = Math.min(s, this.animationGroups.length);
      this.animationGroups.splice(r, 0, i), this.timingOptions.splice(r, 0, i.getTimingOptions());
      const o = [...i.animations], a2 = this.animationGroups.slice(0, r).reduce((c, l) => c + l.animations.length, 0);
      this.animations.splice(a2, 0, ...o);
    }
    this.applyOffsets(), this.ready = Promise.all(this.animationGroups.map((s) => s.ready)).then(() => {
    });
  }
  /**
   * Removes AnimationGroups that match the predicate, then recalculates
   * stagger offsets for remaining groups. Cancelled animations in removed
   * groups are returned.
   */
  removeGroups(e) {
    const n = [], s = [], i = [];
    for (let r = 0; r < this.animationGroups.length; r++)
      e(this.animationGroups[r]) ? n.push(this.animationGroups[r]) : (s.push(this.animationGroups[r]), i.push(this.timingOptions[r]));
    if (n.length === 0) return n;
    for (const r of n)
      r.cancel();
    return this.animationGroups = s, this.timingOptions = i, this.animations = s.flatMap((r) => [...r.animations]), this.applyOffsets(), this.ready = Promise.all(this.animationGroups.map((r) => r.ready)).then(() => {
    }), n;
  }
  async onFinish(e) {
    try {
      await Promise.all(this.animationGroups.map((n) => n.finished)), e();
    } catch (n) {
      console.warn("animation was interrupted - aborting onFinish callback - ", n);
    }
  }
};
var Kt = class {
  _animation;
  customEffect;
  progress;
  _tickCbId;
  _finishHandler;
  constructor(e, n, s, i) {
    const r = new KeyframeEffect(n, [], {
      ...s,
      composite: "add"
    }), { timeline: o } = i;
    this._animation = new Animation(r, o), this._tickCbId = null, this.progress = null, this.customEffect = (a2) => e(r.target, a2), this._finishHandler = (a2) => {
      this.effect.target?.getAnimations().find((c) => c === this._animation) || this.cancel();
    }, this.addEventListener("finish", this._finishHandler), this.addEventListener("remove", this._finishHandler);
  }
  // private tick method for customEffect loop implementation
  _tick() {
    try {
      const e = this.effect?.getComputedTiming().progress ?? null;
      e !== this.progress && (this.customEffect?.(e), this.progress = e), this._tickCbId = requestAnimationFrame(() => {
        this._tick();
      });
    } catch (e) {
      this._tickCbId = null, console.error(
        `failed to run customEffect! effectId: ${this.id}, error: ${e instanceof Error ? e.message : e}`
      );
    }
  }
  // Animation timing properties
  get currentTime() {
    return this._animation.currentTime;
  }
  set currentTime(e) {
    this._animation.currentTime = e;
  }
  get startTime() {
    return this._animation.startTime;
  }
  set startTime(e) {
    this._animation.startTime = e;
  }
  get playbackRate() {
    return this._animation.playbackRate;
  }
  set playbackRate(e) {
    this._animation.playbackRate = e;
  }
  // Animation basic properties
  get id() {
    return this._animation.id;
  }
  set id(e) {
    this._animation.id = e;
  }
  get effect() {
    return this._animation.effect;
  }
  set effect(e) {
    this._animation.effect = e;
  }
  get timeline() {
    return this._animation.timeline;
  }
  set timeline(e) {
    this._animation.timeline = e;
  }
  // Animation readonly state properties
  get finished() {
    return this._animation.finished;
  }
  get pending() {
    return this._animation.pending;
  }
  get playState() {
    return this._animation.playState;
  }
  get ready() {
    return this._animation.ready;
  }
  get replaceState() {
    return this._animation.replaceState;
  }
  // Animation event handlers
  get oncancel() {
    return this._animation.oncancel;
  }
  set oncancel(e) {
    this._animation.oncancel = e;
  }
  get onfinish() {
    return this._animation.onfinish;
  }
  set onfinish(e) {
    this._animation.onfinish = e;
  }
  get onremove() {
    return this._animation.onremove;
  }
  set onremove(e) {
    this._animation.onremove = e;
  }
  // CustomAnimation overridden methods
  play() {
    this._animation.play(), cancelAnimationFrame(this._tickCbId), this._tickCbId = requestAnimationFrame(() => this._tick());
  }
  pause() {
    this._animation.pause(), cancelAnimationFrame(this._tickCbId), this._tickCbId = null;
  }
  cancel() {
    this.removeEventListener("finish", this._finishHandler), this.removeEventListener("remove", this._finishHandler), this._animation.cancel(), this.customEffect(null), cancelAnimationFrame(this._tickCbId), this._tickCbId = null;
  }
  commitStyles() {
    console.warn(
      "CustomEffect animations do not support commitStyles method as they have no style to commit"
    );
  }
  // Animation methods without override
  finish() {
    this._animation.finish();
  }
  persist() {
    this._animation.persist();
  }
  reverse() {
    this._animation.reverse();
  }
  updatePlaybackRate(e) {
    this._animation.updatePlaybackRate(e);
  }
  // Animation events API
  addEventListener(e, n, s) {
    this._animation.addEventListener(e, n, s);
  }
  removeEventListener(e, n, s) {
    this._animation.removeEventListener(e, n, s);
  }
  dispatchEvent(e) {
    return this._animation.dispatchEvent(e);
  }
};
function Qt(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
var ee = { exports: {} };
var Oe = ee.exports;
var Ae;
function Ut() {
  return Ae || (Ae = 1, (function(t) {
    (function(e) {
      var n = function() {
      }, s = e.requestAnimationFrame || e.webkitRequestAnimationFrame || e.mozRequestAnimationFrame || e.msRequestAnimationFrame || function(f) {
        return setTimeout(f, 16);
      };
      function i() {
        var f = this;
        f.reads = [], f.writes = [], f.raf = s.bind(e);
      }
      i.prototype = {
        constructor: i,
        /**
         * We run this inside a try catch
         * so that if any jobs error, we
         * are able to recover and continue
         * to flush the batch until it's empty.
         *
         * @param {Array} tasks
         */
        runTasks: function(f) {
          for (var u; u = f.shift(); ) u();
        },
        /**
         * Adds a job to the read batch and
         * schedules a new frame if need be.
         *
         * @param  {Function} fn
         * @param  {Object} ctx the context to be bound to `fn` (optional).
         * @public
         */
        measure: function(f, u) {
          var d = u ? f.bind(u) : f;
          return this.reads.push(d), r(this), d;
        },
        /**
         * Adds a job to the
         * write batch and schedules
         * a new frame if need be.
         *
         * @param  {Function} fn
         * @param  {Object} ctx the context to be bound to `fn` (optional).
         * @public
         */
        mutate: function(f, u) {
          var d = u ? f.bind(u) : f;
          return this.writes.push(d), r(this), d;
        },
        /**
         * Clears a scheduled 'read' or 'write' task.
         *
         * @param {Object} task
         * @return {Boolean} success
         * @public
         */
        clear: function(f) {
          return a2(this.reads, f) || a2(this.writes, f);
        },
        /**
         * Extend this FastDom with some
         * custom functionality.
         *
         * Because fastdom must *always* be a
         * singleton, we're actually extending
         * the fastdom instance. This means tasks
         * scheduled by an extension still enter
         * fastdom's global task queue.
         *
         * The 'super' instance can be accessed
         * from `this.fastdom`.
         *
         * @example
         *
         * var myFastdom = fastdom.extend({
         *   initialize: function() {
         *     // runs on creation
         *   },
         *
         *   // override a method
         *   measure: function(fn) {
         *     // do extra stuff ...
         *
         *     // then call the original
         *     return this.fastdom.measure(fn);
         *   },
         *
         *   ...
         * });
         *
         * @param  {Object} props  properties to mixin
         * @return {FastDom}
         */
        extend: function(f) {
          if (typeof f != "object") throw new Error("expected object");
          var u = Object.create(this);
          return c(u, f), u.fastdom = this, u.initialize && u.initialize(), u;
        },
        // override this with a function
        // to prevent Errors in console
        // when tasks throw
        catch: null
      };
      function r(f) {
        f.scheduled || (f.scheduled = true, f.raf(o.bind(null, f)));
      }
      function o(f) {
        var u = f.writes, d = f.reads, g;
        try {
          n("flushing reads", d.length), f.runTasks(d), n("flushing writes", u.length), f.runTasks(u);
        } catch (p) {
          g = p;
        }
        if (f.scheduled = false, (d.length || u.length) && r(f), g)
          if (n("task errored", g.message), f.catch) f.catch(g);
          else throw g;
      }
      function a2(f, u) {
        var d = f.indexOf(u);
        return !!~d && !!f.splice(d, 1);
      }
      function c(f, u) {
        for (var d in u)
          u.hasOwnProperty(d) && (f[d] = u[d]);
      }
      var l = e.fastdom = e.fastdom || new i();
      t.exports = l;
    })(typeof window < "u" ? window : typeof Oe < "u" ? Oe : globalThis);
  })(ee)), ee.exports;
}
var Xt = Ut();
var O = /* @__PURE__ */ Qt(Xt);
var de = {};
function Zt(t) {
  Object.assign(de, t);
}
function Jt(t) {
  return t in de ? de[t] : (console.warn(
    `${t} not found in registry. Please make sure to import and register the preset.`
  ), null);
}
function N(t, e) {
  return t ? (e || document).getElementById(t) : null;
}
function en(t, e) {
  return t?.matches(`[data-motion-part~="${e}"]`) ? t : t?.querySelector(`[data-motion-part~="${e}"]`);
}
function tn(t) {
  const e = t.alternate ? "alternate" : "";
  return t.reversed ? `${e ? `${e}-` : ""}reverse` : e || "normal";
}
function ce(t) {
  return `${t.value}${Gt(t.unit)}`;
}
function Ce(t, e, n) {
  return `${t.name || "cover"} ${n && t.offset.unit !== "percentage" ? `calc(100% + ${ce(t.offset)}${e ? ` + ${e}` : ""})` : e ? `calc(${ce(t.offset)} + ${e})` : ce(t.offset)}`;
}
function De(t) {
  return {
    start: Ce(t.startOffset, t.startOffsetAdd),
    end: Ce(t.endOffset, t.endOffsetAdd, true)
  };
}
function Ge(t) {
  return (e) => O.measure(() => e(t));
}
function We(t) {
  return (e) => O.mutate(() => e(t));
}
function W(t) {
  if (t.namedEffect) {
    const e = t.namedEffect.type;
    return typeof e == "string" ? Jt(e) : null;
  } else if (t.keyframeEffect) {
    const e = (s) => {
      const { name: i, keyframes: r } = s.keyframeEffect;
      return [{ ...s, name: i, keyframes: r }];
    };
    return { web: e, style: e, getNames: (s) => {
      const { effectId: i } = s, { name: r } = s.keyframeEffect, o = r || i;
      return o ? [o] : [];
    } };
  } else if (t.customEffect)
    return (e) => [{ ...e, keyframes: [] }];
  return null;
}
function Ve(t, e, n, s) {
  return t.map((i, r) => {
    const o = {
      fill: i.fill,
      easing: J(i.easing),
      iterations: i.iterations === 0 ? 1 / 0 : i.iterations || 1,
      composite: i.composite,
      direction: tn(i)
    };
    return Se(e) ? (o.duration = i.duration, o.delay = i.delay || 0) : e?.trigger === "view-progress" && (s || window.ViewTimeline) ? o.duration = "auto" : (o.duration = 99.99, o.delay = 0.01), {
      effect: i,
      options: o,
      id: n && `${n}-${r + 1}`,
      part: i.part
    };
  });
}
function Se(t) {
  return !t || t.trigger !== "pointer-move" && t.trigger !== "view-progress";
}
function ke(t, e, n, s, i) {
  if (t) {
    if (Se(s) && (e.duration = e.duration || 1, i?.reducedMotion))
      if (e.iterations === 1 || e.iterations == null)
        e = { ...e, duration: 1 };
      else
        return [];
    let r;
    return n instanceof HTMLElement && (r = { measure: Ge(n), mutate: We(n) }), t.web ? t.web(e, r, i) : t(e, r, i);
  }
  return [];
}
function Ye(t, e, n, s, i) {
  const r = t instanceof HTMLElement ? t : N(t, i);
  if (n?.trigger === "pointer-move" && !e.keyframeEffect) {
    let d = e;
    e.customEffect && (d = {
      ...e,
      namedEffect: { id: "", type: "CustomMouse" }
    });
    const g = W(
      d
    ), p = ke(
      g,
      e,
      r,
      n,
      s
    );
    return typeof p != "function" ? null : p(r);
  }
  const o = W(e), a2 = ke(
    o,
    e,
    r,
    n,
    s
  );
  if (!a2 || a2.length === 0)
    return null;
  const c = Ve(a2, n, e.effectId);
  let l;
  const f = n?.trigger === "view-progress";
  f && window.ViewTimeline && (l = new ViewTimeline({
    subject: n.element || N(n.componentId)
  }));
  const u = c.map(({ effect: d, options: g, id: p, part: m }) => {
    const h2 = m ? en(r, m) : r, v = new KeyframeEffect(h2 || null, [], g);
    O.mutate(() => {
      "timing" in d && v.updateTiming(d.timing), v.setKeyframes(d.keyframes);
    });
    const y = f && l ? { timeline: l } : {}, E = typeof d.customEffect == "function" ? new Kt(
      d.customEffect,
      h2 || null,
      g,
      y
    ) : new Animation(v, y.timeline);
    if (f)
      if (l)
        O.mutate(() => {
          const { start: w2, end: S2 } = De(d);
          E.rangeStart = w2, E.rangeEnd = S2, E.play();
        });
      else {
        const { startOffset: w2, endOffset: S2 } = e;
        O.mutate(() => {
          const T = d.startOffset || w2, I2 = d.endOffset || S2;
          Object.assign(E, {
            start: {
              name: T.name,
              offset: T.offset?.value,
              add: d.startOffsetAdd
            },
            end: {
              name: I2.name,
              offset: I2.offset?.value,
              add: d.endOffsetAdd
            }
          });
        });
      }
    return p && (E.id = p), E;
  });
  return new V(u, {
    ...e,
    trigger: { ...n || {} },
    // make sure the group is ready after all animation targets are measured and mutated
    measured: new Promise((d) => O.mutate(d))
  });
}
function an(t, e, n) {
  const s = W(e), i = t instanceof HTMLElement ? t : N(t);
  if (s && s.prepare && i) {
    const r = { measure: Ge(i), mutate: We(i) };
    s.prepare(e, r);
  }
  n && O.mutate(n);
}
function Be(t, e) {
  const n = W(e);
  if (!n)
    return null;
  if (!n.style)
    return e.effectId && t ? cn(t, e.effectId) : null;
  const s = n.getNames(e), r = (typeof t == "string" ? N(t) : t)?.getAnimations(), o = r?.map((c) => c.animationName) || [], a2 = [];
  return s.forEach((c) => {
    o.includes(c) && a2.push(
      r?.find((l) => l.animationName === c)
    );
  }), a2?.length ? new V(a2) : null;
}
function cn(t, e) {
  const s = (typeof t == "string" ? N(t) : t)?.getAnimations().filter((i) => {
    const r = i.id || i.animationName;
    return r ? r.startsWith(e) : true;
  });
  return s?.length ? new V(s) : null;
}
function Ke(t, e, n, s = {}) {
  const { disabled: i, allowActiveEvent: r, ...o } = s, a2 = Ye(t, e, n, o);
  if (!a2)
    return null;
  let c = {};
  if (n.trigger === "view-progress" && !window.ViewTimeline) {
    const l = n.element || N(n.componentId), { ready: f } = a2;
    return a2.animations.map((u) => ({
      /* we use getters for start and end in order to access the animation's start and end
         only when initializing the scrub scene rather than immediately */
      get start() {
        return u.start;
      },
      get end() {
        return u.end;
      },
      viewSource: l,
      ready: f,
      getProgress() {
        return a2.getProgress();
      },
      effect(d, g) {
        const { activeDuration: p } = u.effect.getComputedTiming(), { delay: m } = u.effect.getTiming();
        u.currentTime = ((m || 0) + (p || 0)) * g;
      },
      disabled: i,
      destroy() {
        u.cancel();
      }
    }));
  } else if (n.trigger === "pointer-move") {
    const l = e, { centeredToTarget: f, transitionDuration: u, transitionEasing: d } = l, g = n.axis;
    if (l.keyframeEffect) {
      const p = a2;
      return p.animations?.length === 0 ? null : {
        target: void 0,
        centeredToTarget: f,
        ready: p.ready,
        _currentProgress: 0,
        getProgress() {
          return this._currentProgress;
        },
        effect(h2, v) {
          const y = g === "x" ? v.x : v.y;
          this._currentProgress = y, p.progress(y);
        },
        disabled: i ?? false,
        destroy() {
          p.cancel();
        }
      };
    }
    c = {
      centeredToTarget: f,
      allowActiveEvent: r
    }, e.customEffect && u && (c.transitionDuration = u, c.transitionEasing = be(d)), c.target = a2.target;
  }
  return {
    ...c,
    getProgress() {
      return a2.getProgress();
    },
    effect(l, f, u, d) {
      a2.progress(
        u ? {
          // @ts-expect-error spread error on p
          ...f,
          v: u,
          active: d
        } : f
      );
    },
    disabled: i,
    destroy() {
      a2.cancel();
    }
  };
}
function Y(t, e, n, s = false) {
  const i = Be(t, e);
  return i ? (i.ready = new Promise((r) => {
    an(t, e, r);
  }), i) : Ye(t, e, n, { reducedMotion: s });
}
function fn(t) {
  return t === null ? [null] : typeof t == "string" ? Array.from(document.querySelectorAll(t)) : Array.isArray(t) ? t : [t];
}
function Qe(t, e) {
  const n = [];
  for (const { target: s, options: i } of t) {
    const r = fn(s);
    for (const o of r) {
      const a2 = Y(
        o,
        i,
        void 0,
        e?.reducedMotion
      );
      a2 instanceof V && n.push(a2);
    }
  }
  return n;
}
function ln(t, e, n) {
  const s = Qe(e, n);
  return new Bt(s, t);
}
function te(t, e) {
  return e.includes("&") ? e.replace(/&/g, t) : `${t}${e}`;
}
function k() {
  return "wi-12343210".replace(
    /\d/g,
    (t) => String.fromCharCode(
      (+t ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +t / 4) + 97
    )
    // 97 for "a"
  );
}
function Ue(t) {
  let { transition: e, transitionProperties: n } = t, s = [];
  if (e?.styleProperties) {
    const { duration: i, easing: r, delay: o } = e;
    i && (e.styleProperties.some(
      (c) => c.name.startsWith("--")
    ) ? s = [
      `all ${i}ms ${J(r || "ease")}${o ? ` ${o}ms` : ""}`,
      "visibility 0s"
    ] : s = e.styleProperties.map(
      (c) => `${c.name} ${i}ms ${J(
        r || "ease"
      )}${o ? ` ${o}ms` : ""}`
    ));
  } else
    s = n?.filter((i) => i.duration).map(
      (i) => `${i.name} ${i.duration}ms ${J(i.easing) || "ease"}${i.delay ? ` ${i.delay}ms` : ""}`
    ) || [];
  return s;
}
function gn({
  key: t,
  effectId: e,
  transition: n,
  transitionProperties: s,
  childSelector: i = "> :first-child",
  selectorCondition: r
}) {
  const o = Ue({
    transition: n,
    transitionProperties: s
  }), a2 = (n?.styleProperties || s)?.map(
    (p) => `${p.name}: ${p.value};`
  ) || [], c = t.replace(/"/g, "'"), l = `:is(:state(${e}), :--${e}) ${i}`, f = `[data-interact-effect~="${e}"] ${i}`, u = r ? te(l, r) : l, d = r ? te(f, r) : f, g = [
    `${u},
    ${d} {
      ${a2.join(`
      `)}
    }`
  ];
  if (o.length) {
    const p = `[data-interact-key="${c}"] ${i}`, m = r ? te(p, r) : p;
    g.push(`@media (prefers-reduced-motion: no-preference) { ${m} {
      transition: ${o.join(", ")};
    } }`);
  }
  return g;
}
function ae(t, e, n) {
  const s = (t || []).filter((i) => e[i]?.type === n && e[i].predicate).map((i) => e[i].predicate).join(") and (");
  return s && `(${s})`;
}
function _(t, e) {
  const n = ae(t, e, "media");
  return n && window.matchMedia(n);
}
function L(t, e) {
  return (t || []).filter((n) => e[n]?.type === "selector" && e[n].predicate).map((n) => `:is(${e[n].predicate})`).join("");
}
var K = {
  rangeStart: { name: "cover", offset: { value: 0, unit: "percentage" } },
  rangeEnd: { name: "cover", offset: { value: 100, unit: "percentage" } }
};
function vn(t, e) {
  const n = t?.name ?? K.rangeStart.name, s = e?.name ?? t?.name ?? K.rangeEnd.name, i = {
    name: n,
    offset: t?.offset || K.rangeStart.offset
  }, r = {
    name: s,
    offset: e?.offset || K.rangeEnd.offset
  };
  return { startOffset: i, endOffset: r };
}
function q(t) {
  if ("keyframeEffect" in t && !t.keyframeEffect.name && "effectId" in t && (t.keyframeEffect.name = t.effectId), "duration" in t)
    return {
      id: "",
      ...t
    };
  const { rangeStart: e, rangeEnd: n, ...s } = t, { startOffset: i, endOffset: r } = vn(e, n);
  return {
    id: "",
    startOffset: i,
    endOffset: r,
    ...s
  };
}
function C(t, e, n) {
  let s = t.get(e);
  s || (s = /* @__PURE__ */ new Set(), t.set(e, s)), s.add(n);
}
function B(t, e) {
  t.get(e)?.forEach((s) => {
    const { source: i, target: r, cleanup: o } = s;
    o();
    const a2 = i === e ? r : i;
    t.get(a2)?.delete(s);
  }), t.delete(e);
}
var yn = {
  root: null,
  rootMargin: "0px 0px -10% 0px",
  threshold: [0]
};
var En = {
  root: null,
  rootMargin: "0px",
  threshold: [0]
};
var wn = 0.2;
function bn(t) {
  const e = t.trim().split(/\s+/), n = e[0], s = e.length > 1 ? e[1] : e[0], i = (r) => r.startsWith("-") ? r.slice(1) : parseFloat(r) ? `-${r}` : r;
  return `${i(n)} 0px ${i(s)}`;
}
var D = {};
var M = /* @__PURE__ */ new WeakMap();
var re = /* @__PURE__ */ new WeakSet();
var z = /* @__PURE__ */ new WeakMap();
var Xe = {};
var H = null;
function Sn(t) {
  Xe = t;
}
function Ze(t, e, n) {
  M.get(t)?.forEach(({ source: i, handler: r }) => {
    i === t && r(e, n);
  });
}
function $e() {
  return H || (H = new IntersectionObserver((t) => {
    t.forEach((e) => {
      const n = e.target;
      e.isIntersecting || Ze(n, false, true);
    });
  }, En), H);
}
function Je(t, e = false) {
  const n = JSON.stringify({ ...t, isSafeMode: e });
  if (D[n])
    return D[n];
  const s = t.threshold ?? wn, i = e ? yn : {
    root: null,
    rootMargin: t.inset ? bn(t.inset) : "0px",
    threshold: s
  }, r = new IntersectionObserver((o) => {
    o.forEach((a2) => {
      const c = a2.target, l = !re.has(c);
      if (l && (re.add(c), t.useSafeViewEnter && !a2.isIntersecting)) {
        O.measure(() => {
          const f = a2.boundingClientRect.height, u = a2.rootBounds?.height;
          if (!u)
            return;
          const d = Array.isArray(t.threshold) ? Math.min(...t.threshold) : t.threshold;
          d && f * d > u && O.mutate(() => {
            r.unobserve(c);
            const p = Je(t, true);
            z.set(c, p), p.observe(c);
          });
        });
        return;
      }
      (a2.isIntersecting || !l) && Ze(c, a2.isIntersecting);
    });
  }, i);
  return D[n] = r, r;
}
function Tn(t, e, n, s = {}, { reducedMotion: i, selectorCondition: r, animation: o } = {}) {
  const a2 = { ...Xe, ...s }, c = n.triggerType || "once", l = o || Y(
    e,
    q(n),
    void 0,
    i
  );
  if (!l)
    return;
  const f = Je(a2);
  c !== "once" && l.persist?.();
  let u = true, d = false, g;
  g = { source: t, target: e, handler: (h2, v) => {
    if (!(r && !e.matches(r)))
      if (c === "once") {
        if (h2 && !d) {
          d = true, M.get(t)?.delete(g), M.get(e)?.delete(g);
          const y = M.get(t);
          (!y || y.size === 0) && ((z.get(t) || f).unobserve(t), re.delete(t)), l.play(() => {
            const E = () => {
              e.dataset.interactEnter = "start";
            };
            if (l.isCSS) {
              O.mutate(() => {
                requestAnimationFrame(E);
              });
              const w2 = () => {
                O.mutate(() => {
                  e.dataset.interactEnter = "done";
                });
              };
              l.onFinish(w2), l.onAbort(w2);
            } else
              O.mutate(E);
          });
        }
      } else c === "alternate" ? u && h2 ? (u = false, l.play()) : u || l.reverse() : c === "repeat" ? h2 ? (l.progress(0), l.play()) : v && (l.pause(), l.progress(0)) : c === "state" && (h2 ? l.play() : v && l.pause());
  }, cleanup: () => {
    (z.get(t) || f).unobserve(t), (c === "repeat" || c === "state") && $e().unobserve(t), l.cancel(), re.delete(t), z.delete(t);
  } }, C(M, t, g), C(M, e, g), z.set(t, f), f.observe(t), (c === "repeat" || c === "state") && $e().observe(t);
}
function In(t) {
  B(M, t);
}
function On() {
  H = null, Object.keys(D).forEach((t) => delete D[t]);
}
var _e = {
  add: Tn,
  remove: In,
  setOptions: Sn,
  reset: On
};
function et(t, e) {
  return Object.assign(Object.create(e), t);
}
function An(t, e, n, s) {
  let i = t * (1 - n) + e * n;
  if (s) {
    const r = i - t;
    Math.abs(r) < s && (i = t + s * Math.sign(r));
    const o = e - i;
    if (Math.abs(o) < s)
      return e;
  }
  return i;
}
function Cn(t) {
  let e = false;
  return function() {
    e || (e = true, window.requestAnimationFrame(() => {
      e = false, t();
    }));
  };
}
function qe(t, e) {
  let n = 0;
  return function() {
    n && window.clearTimeout(n), n = window.setTimeout(() => {
      n = 0, t();
    }, e);
  };
}
function kn(t, e) {
  const n = t.match(/^calc\s*\(\s*(-?\d+((px)|([lsd]?vh)|([lsd]?vw)))\s*\+\s*(-?\d+((px)|([lsd]?vh)|([lsd]?vw)))\s*\)\s*$/);
  return oe(n[1], e) + oe(n[6], e);
}
function oe(t, e) {
  return t ? /^-?\d+px$/.test(t) ? parseInt(t) : /^-?\d+[lsd]?vh$/.test(t) ? parseInt(t) * e.viewportHeight / 100 : /^-?\d+[lsd]?vw$/.test(t) ? parseInt(t) * e.viewportWidth / 100 : /^calc\s*\(\s*-?\d+((px)|([lsd]?vh)|([lsd]?vw))\s*\+\s*-?\d+((px)|([lsd]?vh)|([lsd]?vw))\s*\)\s*$/.test(t) ? kn(t, e) : parseInt(t) || 0 : 0;
}
function R(t, e, n) {
  const { name: s, offset: i = 0 } = t, { start: r, end: o } = n, a2 = o - r, c = i / 100;
  let l, f;
  return s === "entry" ? (l = r - e, f = Math.min(e, a2)) : s === "entry-crossing" ? (l = r - e, f = a2) : s === "contain" ? (l = Math.min(o - e, r), f = Math.abs(e - a2)) : s === "exit" ? (l = Math.max(r, o - e), f = Math.min(e, a2)) : s === "exit-crossing" ? (l = r, f = a2) : s === "cover" && (l = r - e, f = a2 + e), l + c * f | 0;
}
function fe(t, e, n, s, i) {
  let r = 0;
  const o = { start: e, end: n };
  return t.forEach((a2, c) => {
    r += a2.offset;
    const l = a2.sticky;
    if (l) {
      if ("end" in l && t[c - 1]?.element) {
        const d = ((i ? a2.element.offsetWidth : a2.element.offsetHeight) || 0) + l.end - s, g = r + d - a2.offset, p = g < o.start, m = !p && g <= n;
        let h2 = 0;
        (p || m) && (h2 = a2.offset, o.end += h2), p && (o.start += h2);
      }
      if ("start" in l) {
        const f = r - l.start, u = f < o.start, d = !u && f <= o.end;
        let g = 0;
        const p = t[c - 1]?.element;
        if (p) {
          if (u || d) {
            const m = (i ? p.offsetWidth : p.offsetHeight) || 0, h2 = a2.offset, v = (i ? a2.element.offsetWidth : a2.element.offsetHeight) || 0;
            g = m - (h2 + v), r += g, o.end += g;
          }
          u && (o.start += g);
        }
      }
    }
  }), o;
}
function $n(t, e, n, s, i, r) {
  const { start: o, end: a2, duration: c } = t;
  let l = o, f = a2, u = t.startRange, d = t.endRange, g;
  if (typeof c == "string") {
    u = { name: c, offset: 0 }, d = { name: c, offset: 100 }, l = R(u, n, e), f = R(d, n, e), g = f - l;
    const p = fe(r, l, f, n, s);
    l = p.start, f = p.end;
  } else {
    if (u || o?.name) {
      u = u || o;
      const p = oe(u.add, i), m = R({ ...u, offset: 0 }, n, e), h2 = R({ ...u, offset: 100 }, n, e), v = fe(r, m, h2, n, s);
      l = v.start + u.offset / 100 * (v.end - v.start) + p;
    }
    if (d || a2?.name) {
      d = d || a2;
      const p = oe(d.add, i), m = R({ ...d, offset: 0 }, n, e), h2 = R({ ...d, offset: 100 }, n, e), v = fe(r, m, h2, n, s);
      f = v.start + d.offset / 100 * (v.end - v.start) + p;
    } else typeof c == "number" && (f = l + c);
  }
  return !g && !c && (g = f - l), { ...t, start: l, end: f, startRange: u, endRange: d, duration: g || c };
}
function _n(t) {
  return t.position === "sticky";
}
function qn(t, e, n) {
  return t.position === "fixed" && (!e || e === window.document.body || e === n);
}
function Mn(t, e) {
  return parseInt(e ? t.left : t.top);
}
function xn(t, e) {
  return parseInt(e ? t.right : t.bottom);
}
function Pn(t, e, n) {
  n && (t.style.position = "static");
  const s = (e ? t.offsetLeft : t.offsetTop) || 0;
  return n && (t.style.position = null), s;
}
function Ln(t, e) {
  let n;
  const s = Mn(t, e), i = xn(t, e), r = !isNaN(s), o = !isNaN(i);
  return (r || o) && (n = {}, r && (n.start = s), o && (n.end = i)), n;
}
function Q(t, e, n, s, i) {
  const r = t[0].viewSource, o = [];
  let a2 = (s ? r.offsetWidth : r.offsetHeight) || 0, c = 0, l = r;
  for (; l; ) {
    const u = window.getComputedStyle(l), d = _n(u), g = d ? Ln(u, s) : void 0, p = Pn(l, s, d);
    if ((!g || !("end" in g)) && (c += p), o.push({ element: l, offset: p, sticky: g }), l = l.offsetParent, qn(u, l, e))
      break;
    if (l === e) {
      o.push({ element: l, offset: 0 });
      break;
    }
  }
  return o.reverse(), t.map((u) => ({
    ...$n(
      u,
      { start: c, end: c + a2 },
      n,
      s,
      i,
      o
    )
  }));
}
var Me = 100;
var Rn = {
  horizontal: false,
  observeViewportEntry: true,
  viewportRootMargin: "7% 7%",
  observeViewportResize: false,
  observeSourcesResize: false,
  observeContentResize: false
};
function Fn(t, e, n, s) {
  let i = 0;
  return t >= e && t <= n ? i = s ? (t - e) / s : 1 : t > n && (i = 1), i;
}
function xe(t, e) {
  return t === window ? e ? window.document.documentElement.clientWidth : window.document.documentElement.clientHeight : e ? t.clientWidth : t.clientHeight;
}
function Nn() {
  return {
    viewportWidth: window.document.documentElement.clientWidth,
    viewportHeight: window.document.documentElement.clientHeight
  };
}
function zn(t) {
  const e = et(t, Rn), n = e.root, s = e.horizontal, i = /* @__PURE__ */ new WeakMap();
  let r = xe(n, s), o, a2, c, l, f;
  const u = [], d = Nn();
  if (e.scenes = Object.values(
    // TODO(ameerf): find a polyfill and use groupBy instead of following reduce
    t.scenes.reduce(
      (m, h2, v) => {
        const y = h2.groupId ? `group-${h2.groupId}` : String(v);
        return m[y] ? m[y].push(h2) : m[y] = [h2], m;
      },
      {}
    )
  ).flatMap((m) => (m.every((h2) => h2.viewSource && (typeof h2.duration == "string" || h2.start?.name)) ? (m = Q(m, n, r, s, d), (e.observeSourcesResize || e.observeContentResize) && u.push(m)) : m.forEach((h2) => {
    h2.end == null && (h2.end = h2.start + h2.duration), h2.duration == null && (h2.duration = h2.end - h2.start);
  }), m)), e.scenes.forEach((m, h2) => {
    m.index = h2;
  }), u.length) {
    const m = /* @__PURE__ */ new Map();
    window.ResizeObserver && (c = new window.ResizeObserver(function(h2) {
      h2.forEach((v) => {
        const y = m.get(v.target), E = Q(y, n, r, s, d);
        E.forEach((w2, S2) => {
          e.scenes[w2.index] = E[S2];
        }), u.splice(u.indexOf(y), 1, E);
      });
    }), u.forEach((h2) => {
      c.observe(h2[0].viewSource, { box: "border-box" }), m.set(h2[0].viewSource, h2);
    }), e.observeContentResize && e.contentRoot && new window.ResizeObserver(qe(() => {
      const v = u.map((y) => {
        const E = Q(y, n, r, s, d);
        return E.forEach((w2, S2) => {
          e.scenes[w2.index] = E[S2];
        }), E;
      });
      u.length = 0, u.push(...v), u.forEach((y) => {
        m.set(y[0].viewSource, y);
      });
    }, Me)).observe(e.contentRoot, { box: "border-box" })), e.observeViewportResize && (l = qe(function() {
      r = xe(n, s);
      const h2 = u.map((v) => {
        const y = Q(v, n, r, s, d);
        return y.forEach((E, w2) => {
          e.scenes[E.index] = y[w2];
        }), y;
      });
      u.length = 0, u.push(...h2), u.forEach((v) => {
        m.set(v[0].viewSource, v);
      });
    }, Me), n === window ? window.addEventListener("resize", l) : window.ResizeObserver && (f = new window.ResizeObserver(l), f.observe(n, { box: "border-box" })));
  }
  e.observeViewportEntry && window.IntersectionObserver && (a2 = new window.IntersectionObserver(function(m) {
    m.forEach((h2) => {
      (i.get(h2.target) || []).forEach((v) => {
        v.disabled = !h2.isIntersecting;
      });
    });
  }, {
    root: n === window ? window.document : n,
    rootMargin: e.viewportRootMargin,
    threshold: 0
  }), e.scenes.forEach((m) => {
    if (m.viewSource) {
      let h2 = i.get(m.viewSource);
      h2 || (h2 = [], i.set(m.viewSource, h2), a2.observe(m.viewSource)), h2.push(m);
    }
  }));
  function g({ p: m, vp: h2 }) {
    m = +m.toFixed(1);
    const v = +h2.toFixed(4);
    if (m !== o) {
      for (let y of e.scenes)
        if (!y.disabled) {
          const { start: E, end: w2, duration: S2 } = y, T = Fn(m, E, w2, S2);
          y.effect(y, T, v);
        }
      o = m;
    }
  }
  function p() {
    e.scenes.forEach((m) => m.destroy?.()), a2 && (a2.disconnect(), a2 = null), c && (c.disconnect(), c = null), l && (f ? (f.disconnect(), f = null) : window.removeEventListener("resize", l));
  }
  return {
    tick: g,
    destroy: p
  };
}
var Hn = {
  transitionActive: false,
  transitionFriction: 0.9,
  transitionEpsilon: 1,
  velocityActive: false,
  velocityMax: 1
};
var jn = class {
  constructor(e = {}) {
    this.config = et(e, Hn), this.progress = {
      p: 0,
      prevP: 0,
      vp: 0
    }, this.currentProgress = {
      p: 0,
      prevP: 0,
      vp: 0
    }, this._lerpFrameId = 0, this.effect = null;
    const n = !this.config.root || this.config.root === window.document.body;
    this.config.root = n ? window : this.config.root, this.config.contentRoot = this.config.contentRoot || (n ? window.document.body : this.config.root.firstElementChild), this.config.resetProgress = this.config.resetProgress || this.resetProgress.bind(this), this._measure = this.config.measure || (() => {
      const s = this.config.root;
      this.progress.p = this.config.horizontal ? s.scrollX || s.scrollLeft || 0 : s.scrollY || s.scrollTop || 0;
    }), this._trigger = Cn(() => {
      this._measure?.(), this.tick(true);
    });
  }
  /**
   * Setup event and effect, and reset progress and frame.
   */
  start() {
    this.setupEffect(), this.setupEvent(), this.resetProgress(), this.tick();
  }
  /**
   * Removes event listener.
   */
  pause() {
    this.removeEvent();
  }
  /**
   * Reset progress in the DOM and inner state to given x and y.
   *
   * @param {Object} [scrollPosition]
   * @param {number} [scrollPosition.x]
   * @param {number} [scrollPosition.y]
   */
  resetProgress(e = {}) {
    const n = this.config.root, s = e.x || e.x === 0 ? e.x : n.scrollX || n.scrollLeft || 0, i = e.y || e.y === 0 ? e.y : n.scrollY || n.scrollTop || 0, r = this.config.horizontal ? s : i;
    this.progress.p = r, this.progress.prevP = r, this.progress.vp = 0, this.config.transitionActive && (this.currentProgress.p = r, this.currentProgress.prevP = r, this.currentProgress.vp = 0), e && this.config.root.scrollTo(s, i);
  }
  /**
   * Handle animation frame work.
   *
   * @param {boolean} [clearLerpFrame] whether to cancel an existing lerp frame
   */
  tick(e) {
    const n = this.config.transitionActive;
    n && this.lerp();
    const s = n ? this.currentProgress : this.progress;
    if (this.config.velocityActive) {
      const i = s.p - s.prevP, r = i < 0 ? -1 : 1;
      s.vp = Math.min(this.config.velocityMax, Math.abs(i)) / this.config.velocityMax * r;
    }
    this.effect.tick(s), n && s.p !== this.progress.p && (e && this._lerpFrameId && window.cancelAnimationFrame(this._lerpFrameId), this._lerpFrameId = window.requestAnimationFrame(() => this.tick())), s.prevP = s.p;
  }
  /**
   * Calculate current progress.
   */
  lerp() {
    this.currentProgress.p = An(this.currentProgress.p, this.progress.p, +(1 - this.config.transitionFriction).toFixed(3), this.config.transitionEpsilon);
  }
  /**
   * Stop the event and effect, and remove all DOM side-effects.
   */
  destroy() {
    this.pause(), this.removeEffect();
  }
  /**
   * Register to scroll for triggering update.
   */
  setupEvent() {
    this.removeEvent(), this.config.root.addEventListener("scroll", this._trigger);
  }
  /**
   * Remove scroll handler.
   */
  removeEvent() {
    this.config.root.removeEventListener("scroll", this._trigger);
  }
  /**
   * Reset registered effect.
   */
  setupEffect() {
    this.removeEffect(), this.effect = zn(this.config);
  }
  /**
   * Remove registered effect.
   */
  removeEffect() {
    this.effect && this.effect.destroy(), this.effect = null;
  }
};
var he = /* @__PURE__ */ new WeakMap();
var tt = () => ({});
function Dn(t) {
  tt = t;
}
function Gn(t, e, n, s, { reducedMotion: i }) {
  if (i)
    return;
  const r = {
    trigger: "view-progress",
    element: t
  }, o = q(n);
  let a2;
  if ("ViewTimeline" in window) {
    const l = Y(
      e,
      o,
      r
    );
    l && !l.isCSS && (l.play(), a2 = () => {
      l.ready.then(() => {
        l.cancel();
      });
    });
  } else {
    const l = Ke(e, o, r);
    if (l) {
      const f = Array.isArray(l) ? l : [l], u = new jn({
        viewSource: t,
        scenes: f,
        observeViewportEntry: false,
        observeViewportResize: false,
        observeSourcesResize: true,
        root: document.body,
        ...tt()
      });
      a2 = () => {
        u.destroy();
      }, Promise.all(f.map((d) => d.ready || Promise.resolve())).then(
        () => {
          u.start();
        }
      );
    }
  }
  if (!a2) return;
  const c = { source: t, target: e, cleanup: a2 };
  C(he, t, c), C(he, e, c);
}
function Wn(t) {
  B(he, t);
}
var Vn = {
  add: Gn,
  remove: Wn,
  registerOptionsGetter: Dn
};
function Pe(t, e, n) {
  return Math.min(Math.max(t, n), e);
}
function Le(t) {
  let e = false;
  return function() {
    if (!e)
      return e = true, window.requestAnimationFrame(() => {
        e = false, t();
      });
  };
}
function Yn(t) {
  let e = t, n = 0, s = 0;
  if (e.offsetParent)
    do
      n += e.offsetLeft, s += e.offsetTop, e = e.offsetParent;
    while (e);
  return {
    left: n,
    top: s,
    width: t.offsetWidth,
    height: t.offsetHeight
  };
}
function Bn() {
  const t = window.devicePixelRatio;
  let e = false;
  if (t === 1)
    return false;
  document.body.addEventListener("pointerdown", (s) => {
    e = s.offsetX !== 10;
  }, { once: true });
  const n = new PointerEvent("pointerdown", {
    clientX: 10
  });
  return document.body.dispatchEvent(n), e;
}
function Kn() {
  return new Promise((t) => {
    const e = window.scrollY;
    let n = false, s;
    function i() {
      document.body.addEventListener("pointerdown", (a2) => {
        s === void 0 ? s = a2.offsetY : n = a2.offsetY === s;
      }, { once: true });
      const o = new PointerEvent("pointerdown", {
        clientY: 500
      });
      document.body.dispatchEvent(o);
    }
    function r() {
      window.scrollY !== e && (window.removeEventListener("scroll", r), i(), t(n));
    }
    i(), window.addEventListener("scroll", r), window.scrollY > 0 && window.scrollBy(0, -1);
  });
}
function Qn(t) {
  Kn().then((e) => {
    t.fixRequired = e, e && (window.addEventListener("scroll", t.scrollHandler), t.scrollHandler());
  });
}
var U = 0;
var ne = /* @__PURE__ */ new Set();
function Un() {
  const t = (n) => {
    for (let s of n.changedTouches)
      ne.add(s.identifier);
  }, e = (n) => {
    for (let s of n.changedTouches)
      ne.delete(s.identifier);
  };
  return document.addEventListener("touchstart", t, { passive: true }), document.addEventListener("touchend", e, { passive: true }), function() {
    ne.clear(), document.removeEventListener("touchstart", t), document.removeEventListener("touchend", e);
  };
}
function Xn(t, e) {
  if ("onscrollend" in window)
    return t.addEventListener("scrollend", e), function() {
      t.removeEventListener("scrollend", e);
    };
  let n = 0, s;
  U || (s = Un()), U += 1;
  function i(r) {
    clearTimeout(n), n = setTimeout(() => {
      ne.size ? setTimeout(i, 100) : (e(r), n = 0);
    }, 100);
  }
  return t.addEventListener("scroll", i), function() {
    t.removeEventListener("scroll", i), U -= 1, U || s();
  };
}
function Zn(t, e, n) {
  return {
    x(s) {
      const i = t.left - n.x + t.width / 2, r = i >= e.width / 2, o = (r ? i : e.width - i) * 2, a2 = r ? 0 : i - o / 2;
      return (s - a2) / o;
    },
    y(s) {
      const i = t.top - n.y + t.height / 2, r = i >= e.height / 2, o = (r ? i : e.height - i) * 2, a2 = r ? 0 : i - o / 2;
      return (s - a2) / o;
    }
  };
}
function Jn(t, e) {
  this.x = window.scrollX, this.y = window.scrollY, requestAnimationFrame(() => t && t(e));
}
function es(t) {
  t.rect.width = window.document.documentElement.clientWidth, t.rect.height = window.document.documentElement.clientHeight;
}
function ts(t) {
  const e = new ResizeObserver((n) => {
    n.forEach((s) => {
      t.rect.width = s.borderBoxSize[0].inlineSize, t.rect.height = s.borderBoxSize[0].blockSize;
    });
  });
  return e.observe(t.root, { box: "border-box" }), e;
}
function ns(t) {
  let e = false, n = { x: t.rect.width / 2, y: t.rect.height / 2, vx: 0, vy: 0 }, s, i, r, o, a2;
  const c = { x: 0, y: 0 };
  t.scenes.forEach((f) => {
    f.target && f.centeredToTarget && (f.transform = Zn(Yn(f.target), t.rect, c), e = true), t.root ? i = ts(t) : (r = es.bind(null, t), window.addEventListener("resize", r));
  }), s = function(f) {
    for (let u of t.scenes)
      if (!u.disabled) {
        const d = u.transform?.x(f.x) || f.x / t.rect.width, g = u.transform?.y(f.y) || f.y / t.rect.height, p = +Pe(0, 1, d).toPrecision(4), m = +Pe(0, 1, g).toPrecision(4), h2 = { x: f.vx, y: f.vy };
        t.allowActiveEvent && (f.active = d <= 1 && g <= 1 && d >= 0 && g >= 0), u.effect(u, { x: p, y: m }, h2, f.active);
      }
    Object.assign(n, f);
  }, e && (o = Jn.bind(c, s, n), a2 = Xn(document, o));
  function l() {
    t.scenes.forEach((f) => f.destroy?.()), a2?.(), i ? (i.disconnect(), i = null) : (window.removeEventListener("resize", r), r = null), s = null, n = null;
  }
  return {
    tick: s,
    destroy: l
  };
}
var ss = 1e3 / 60 * 3;
var X;
function is() {
  F.x = window.scrollX, F.y = window.scrollY;
}
var F = { x: 0, y: 0, scrollHandler: is, fixRequired: void 0 };
var rs = class {
  constructor(e = {}) {
    this.config = { ...e }, this.effect = null, this._nextTick = null, this._nextTransitionTick = null, this._startTime = 0;
    let n;
    this.config.transitionDuration ? n = this.config.noThrottle ? () => this.transition() : Le(() => this.transition()) : n = this.config.noThrottle ? () => (this.tick(), null) : Le(() => {
      this.tick();
    }), this.config.rect = this.config.root ? {
      width: this.config.root.offsetWidth,
      height: this.config.root.offsetHeight
    } : {
      width: window.document.documentElement.clientWidth,
      height: window.document.documentElement.clientHeight
    }, this.progress = {
      x: this.config.rect.width / 2,
      y: this.config.rect.height / 2,
      vx: 0,
      vy: 0
    }, this.previousProgress = { ...this.progress }, this.currentProgress = null;
    const s = (i) => {
      const r = this.config.root ? i.offsetX : i.x, o = this.config.root ? i.offsetY : i.y;
      this.progress.vx = r - this.progress.x, this.progress.vy = o - this.progress.y, this.progress.x = r, this.progress.y = o, this._nextTick = n();
    };
    if (this._pointerLeave = () => {
      this.progress.active = false, this.progress.vx = 0, this.progress.vy = 0, this._nextTick = n();
    }, this._pointerEnter = () => {
      this.progress.active = true, this._nextTick = n();
    }, this.config.root) {
      X = typeof X == "boolean" ? X : Bn();
      const i = X ? window.devicePixelRatio : 1;
      typeof F.fixRequired > "u" && Qn(F), this._measure = (r) => {
        if (r.target !== this.config.root) {
          const o = new PointerEvent("pointermove", {
            bubbles: true,
            cancelable: true,
            clientX: r.x * i + F.x,
            clientY: r.y * i + F.y
          });
          r.stopPropagation(), this.config.root.dispatchEvent(o);
        } else
          s(r);
      };
    } else
      this._measure = s;
  }
  /**
   * Setup event and effect, and reset progress and frame.
   */
  start() {
    this.setupEffect(), this.setupEvent();
  }
  /**
   * Removes event listener.
   */
  pause() {
    this.removeEvent();
  }
  /**
   * Handle animation frame work.
   */
  tick() {
    this.effect.tick(this.progress);
  }
  /**
   * Starts a transition from the previous progress to the current progress.
   *
   * @returns {number} the requestAnimationFrame id for the transition tick.
   */
  transition() {
    const e = this.config.transitionDuration, n = this.config.transitionEasing || ((o) => o), s = performance.now();
    let i = false;
    const r = (o) => {
      const a2 = (o - this._startTime) / e, c = n(Math.min(1, a2));
      i && (this.progress.vx = 0, this.progress.vy = 0, i = false), this.currentProgress = Object.entries(this.progress).reduce((l, [f, u]) => (f === "active" ? l[f] = u : l[f] = this.previousProgress[f] + (u - this.previousProgress[f]) * c, l), this.currentProgress || {}), a2 < 1 && (this._nextTransitionTick = requestAnimationFrame(r), i = o - this._startTime > ss), this.effect.tick(this.currentProgress);
    };
    return this._startTime ? (this._nextTransitionTick && cancelAnimationFrame(this._nextTransitionTick), Object.assign(this.previousProgress, this.currentProgress), this._startTime = s, r(s)) : this._startTime = s, this._nextTransitionTick;
  }
  /**
   * Stop the event and effect, and remove all DOM side effects.
   */
  destroy() {
    this.pause(), this.removeEffect(), this._nextTick && cancelAnimationFrame(this._nextTick), this._nextTransitionTick && cancelAnimationFrame(this._nextTransitionTick);
  }
  /**
   * Register to pointermove for triggering update.
   */
  setupEvent() {
    this.removeEvent();
    const e = this.config.root || window;
    e.addEventListener("pointermove", this._measure, { passive: true }), this.config.eventSource && this.config.eventSource.addEventListener("pointermove", this._measure, { passive: true }), this.config.allowActiveEvent && (e.addEventListener("pointerleave", this._pointerLeave, { passive: true }), e.addEventListener("pointerenter", this._pointerEnter, { passive: true }), this.config.eventSource && (this.config.eventSource.addEventListener("pointerleave", this._pointerLeave, { passive: true }), this.config.eventSource.addEventListener("pointerenter", this._pointerEnter, { passive: true })));
  }
  /**
   * Remove pointermove handler.
   */
  removeEvent() {
    const e = this.config.root || window;
    e.removeEventListener("pointermove", this._measure), this.config.eventSource && this.config.eventSource.removeEventListener("pointermove", this._measure), this.config.allowActiveEvent && (e.removeEventListener("pointerleave", this._pointerLeave), e.removeEventListener("pointerenter", this._pointerEnter), this.config.eventSource && (this.config.eventSource.removeEventListener("pointerleave", this._pointerLeave), this.config.eventSource.removeEventListener("pointerenter", this._pointerEnter)));
  }
  /**
   * Reset registered effect.
   */
  setupEffect() {
    this.removeEffect(), this.effect = ns(this.config);
  }
  /**
   * Remove registered effect.
   */
  removeEffect() {
    this.effect && this.effect.destroy(), this.effect = null;
  }
};
var me = /* @__PURE__ */ new WeakMap();
var nt = () => ({});
function os(t) {
  nt = t;
}
function as(t, e, n, s = {}, { reducedMotion: i }) {
  if (i)
    return;
  const r = {
    trigger: "pointer-move",
    element: t,
    axis: s.axis ?? "y"
  }, o = Ke(e, q(n), r);
  if (o) {
    const a2 = Array.isArray(o) ? o : [o], c = new rs({
      root: s.hitArea === "self" ? t : void 0,
      scenes: a2,
      ...nt()
    }), f = { source: t, target: e, cleanup: () => {
      c.destroy();
    } };
    C(me, t, f), C(me, e, f), Promise.all(
      a2.map((u) => u.ready || Promise.resolve())
    ).then(() => {
      c.start();
    });
  }
}
function cs(t) {
  B(me, t);
}
var fs = {
  add: as,
  remove: cs,
  registerOptionsGetter: os
};
var pe = /* @__PURE__ */ new WeakMap();
function ls(t, e, n, s, {
  reducedMotion: i,
  selectorCondition: r,
  animation: o,
  sourceAnimationOptions: a2
}) {
  const c = o || Y(
    e,
    q(n),
    void 0,
    i
  );
  if (!c)
    return;
  const { effectId: l } = s, f = (g) => {
    if (r && !e.matches(r)) return;
    const p = g.animationName, m = g.detail?.effectId, h2 = a2 ? Be(t, a2) : null;
    if (h2) {
      if (h2.playState === "running" || p && !h2.hasAnimationName(p))
        return;
      if (m && m !== l && !h2.hasAnimationId(m))
        return;
    }
    c.play();
  }, d = { source: t, target: e, cleanup: () => {
    c.cancel(), t.removeEventListener("animationend", f);
  } };
  C(pe, t, d), C(pe, e, d), t.addEventListener("animationend", f);
}
function us(t) {
  B(pe, t);
}
var ds = {
  add: ls,
  remove: us
};
function hs(t, e, n = false, s, i, r) {
  const o = r || Y(
    t,
    q(e),
    void 0,
    n
  );
  if (!o)
    return null;
  let a2 = true;
  const c = e.triggerType || "alternate";
  return (l) => {
    if (s && !t.matches(s)) return;
    const f = !i, u = i?.enter?.includes(l.type), d = i?.leave?.includes(l.type);
    if (u || f) {
      if (c === "alternate" || c === "state")
        a2 ? (a2 = false, o.play()) : c === "alternate" ? o.reverse() : c === "state" && (o.playState === "running" ? o.pause() : o.playState !== "finished" && o.play());
      else {
        if (o.progress(0), delete t.dataset.interactEnter, o.isCSS) {
          const g = () => {
            O.mutate(() => {
              t.dataset.interactEnter = "done";
            });
          };
          o.onFinish(g), o.onAbort(g);
        }
        o.play();
      }
      return;
    }
    d && (c === "alternate" ? o.reverse() : c === "repeat" ? (o.cancel(), O.mutate(() => {
      delete t.dataset.interactEnter;
    })) : c === "state" && o.playState === "running" && o.pause());
  };
}
function ms(t, e, {
  effectId: n,
  listContainer: s,
  listItemSelector: i,
  stateAction: r
}, o, a2) {
  const c = !!s, l = r ?? "toggle", f = l === "toggle";
  return (u) => {
    if (o && !t.matches(o)) return;
    const d = c ? t.closest(
      `${s} > ${i || ""}:has(:scope)`
    ) : void 0, g = !a2, p = a2?.enter?.includes(u.type), m = a2?.leave?.includes(u.type);
    g ? e.toggleEffect(n, l, d) : (p && e.toggleEffect(n, f ? "add" : l, d), m && f && e.toggleEffect(n, "remove", d));
  };
}
var ge = /* @__PURE__ */ new WeakMap();
function Re(t, e) {
  return (n) => {
    const s = n;
    t.contains(s.relatedTarget) || e(s);
  };
}
function ps(t) {
  return (e) => {
    const n = e;
    n.pointerType && t(n);
  };
}
function gs(t) {
  return (e) => {
    const n = e;
    n.code === "Space" ? (n.preventDefault(), t(n)) : n.code === "Enter" && t(n);
  };
}
var vs = {
  focusin: (t, e) => Re(t, e),
  focusout: (t, e) => Re(t, e),
  click: (t, e) => ps(e),
  keydown: (t, e) => gs(e)
};
function ys(t, e, n) {
  const s = vs[t];
  return s ? s(e, n) : (i) => n(i);
}
function Es(t) {
  return typeof t == "object" && !Array.isArray(t) && ("enter" in t || "leave" in t);
}
function ws(t) {
  if (typeof t == "string")
    return { toggle: [t] };
  if (Array.isArray(t))
    return { toggle: [...t] };
  if (Es(t)) {
    const e = t.enter ? [...t.enter] : [], n = t.leave ? [...t.leave] : [];
    return { enter: e, leave: n };
  }
  return {};
}
function bs(t) {
  return !!(t.enter?.length || t.leave?.length);
}
function Ss(t) {
  return bs(t) ? { enter: t.enter ?? [], leave: t.leave ?? [] } : void 0;
}
function Ts(t, e, n, s, {
  reducedMotion: i,
  targetController: r,
  selectorCondition: o,
  animation: a2
}) {
  const c = ws(s.eventConfig), l = n.transition || n.transitionProperties, f = Ss(c);
  let u, d = false;
  if (l ? u = ms(
    e,
    r,
    n,
    o,
    f
  ) : (u = hs(
    e,
    n,
    i,
    o,
    f,
    a2
  ), d = n.triggerType === "once"), !u)
    return;
  const g = u, p = new AbortController();
  function m(y, E, w2) {
    const S2 = ys(E, t, g);
    y.addEventListener(E, S2, { ...w2, signal: p.signal });
  }
  const v = { source: t, target: e, cleanup: () => {
    p.abort();
  } };
  if (C(ge, t, v), C(ge, e, v), f) {
    const y = c.enter, E = c.leave;
    y.forEach((T) => {
      T === "focusin" && (t.tabIndex = 0), m(t, T, { passive: true, once: d });
    });
    const w2 = !n.stateAction || n.stateAction === "toggle";
    (l ? w2 : n.triggerType !== "once") && E.forEach((T) => {
      if (T === "focusout") {
        m(t, T, { once: d });
        return;
      }
      m(t, T, { passive: true });
    });
  } else
    (c.toggle ?? []).forEach((E) => {
      m(t, E, { once: d, passive: E !== "keydown" });
    });
}
function Is(t) {
  B(ge, t);
}
var j = {
  add: Ts,
  remove: Is
};
var ve = {
  click: ["click"],
  activate: ["click", "keydown"],
  hover: { enter: ["mouseenter"], leave: ["mouseleave"] },
  interest: {
    enter: ["mouseenter", "focusin"],
    leave: ["mouseleave", "focusout"]
  }
};
var Fe = {
  click: ve.activate,
  hover: ve.interest
};
function Z(t) {
  const e = ve[t];
  return (n, s, i, r, o) => {
    const a2 = o?.allowA11yTriggers && t in Fe ? Fe[t] : e;
    j.add(n, s, i, { eventConfig: a2 }, o ?? {});
  };
}
var x = {
  viewEnter: _e,
  hover: {
    add: Z("hover"),
    remove: j.remove
  },
  click: {
    add: Z("click"),
    remove: j.remove
  },
  pageVisible: _e,
  animationEnd: ds,
  viewProgress: Vn,
  pointerMove: fs,
  activate: {
    add: Z("activate"),
    remove: j.remove
  },
  interest: {
    add: Z("interest"),
    remove: j.remove
  }
};
function Os(t) {
  return t.replace(/\[([-\w]+)]/g, "[]");
}
var b = class _b {
  static defineInteractElement;
  dataCache;
  addedInteractions;
  mediaQueryListeners;
  listInteractionsCache;
  controllers;
  static forceReducedMotion = false;
  static allowA11yTriggers = true;
  static instances = [];
  static controllerCache = /* @__PURE__ */ new Map();
  static sequenceCache = /* @__PURE__ */ new Map();
  static elementSequenceMap = /* @__PURE__ */ new WeakMap();
  constructor() {
    this.dataCache = { effects: {}, sequences: {}, conditions: {}, interactions: {} }, this.addedInteractions = {}, this.mediaQueryListeners = /* @__PURE__ */ new Map(), this.listInteractionsCache = {}, this.controllers = /* @__PURE__ */ new Set();
  }
  init(e, n) {
    if (typeof window > "u" || !window.customElements)
      return;
    const s = n?.useCustomElement ?? !!_b.defineInteractElement;
    this.dataCache = Cs(e, s);
    const i = _b.defineInteractElement?.();
    s && i === false ? document.querySelectorAll("interact-element").forEach((r) => {
      r.connect();
    }) : _b.controllerCache.forEach(
      (r, o) => r.connect(o)
    );
  }
  destroy() {
    for (const e of this.controllers)
      e.disconnect();
    for (const [, e] of this.mediaQueryListeners.entries())
      e.mql.removeEventListener("change", e.handler);
    this.mediaQueryListeners.clear(), this.addedInteractions = {}, this.listInteractionsCache = {}, this.controllers.clear(), this.dataCache = { effects: {}, sequences: {}, conditions: {}, interactions: {} }, _b.instances.splice(_b.instances.indexOf(this), 1);
  }
  setController(e, n) {
    this.controllers.add(n), _b.setController(e, n);
  }
  deleteController(e, n = false) {
    const s = _b.controllerCache.get(e);
    this.clearInteractionStateForKey(e), this.clearMediaQueryListenersForKey(e), s && n && (this.controllers.delete(s), _b.deleteController(e));
  }
  has(e) {
    return !!this.get(e);
  }
  get(e) {
    const n = Os(e);
    return this.dataCache.interactions[n];
  }
  clearMediaQueryListenersForKey(e) {
    for (const [n, s] of this.mediaQueryListeners.entries())
      s.key === e && (s.mql.removeEventListener("change", s.handler), this.mediaQueryListeners.delete(n));
  }
  clearInteractionStateForKey(e) {
    (this.get(e)?.interactionIds || []).forEach((i) => {
      const r = $(i, e);
      delete this.addedInteractions[r];
    });
    const s = `${e}::seq::`;
    for (const i of _b.sequenceCache.keys())
      i.startsWith(s) && (_b.sequenceCache.delete(i), delete this.addedInteractions[i]);
  }
  setupMediaQueryListener(e, n, s, i) {
    this.mediaQueryListeners.has(e) || (n.addEventListener("change", i), this.mediaQueryListeners.set(e, {
      mql: n,
      handler: i,
      key: s
    }));
  }
  static create(e, n) {
    const s = new _b();
    return _b.instances.push(s), s.init(e, n), s;
  }
  static destroy() {
    _b.controllerCache.forEach((e) => {
      e.disconnect();
    }), _b.instances.length = 0, _b.controllerCache.clear(), _b.sequenceCache.clear(), _b.elementSequenceMap = /* @__PURE__ */ new WeakMap();
  }
  static setup(e) {
    e.scrollOptionsGetter && x.viewProgress.registerOptionsGetter?.(
      e.scrollOptionsGetter
    ), e.pointerOptionsGetter && x.pointerMove.registerOptionsGetter?.(
      e.pointerOptionsGetter
    ), e.viewEnter && x.viewEnter.setOptions(
      e.viewEnter
    ), e.allowA11yTriggers !== void 0 && (_b.allowA11yTriggers = e.allowA11yTriggers);
  }
  static getInstance(e) {
    const n = _b.instances.find((s) => s.has(e));
    return n || console.warn(`Interact: Instance for key "${e}" not found`), n;
  }
  static getController(e) {
    const n = e ? _b.controllerCache.get(e) : void 0;
    return n || console.warn(`Interact: Controller for key "${e}" not found`), n;
  }
  static setController(e, n) {
    _b.controllerCache.set(e, n);
  }
  static deleteController(e) {
    _b.controllerCache.delete(e);
  }
  static registerEffects = Zt;
  static getSequence(e, n, s, i) {
    const r = _b.sequenceCache.get(e);
    if (r) return r;
    const o = ln(n, s, i);
    return _b.sequenceCache.set(e, o), _b._registerSequenceElements(s, o), o;
  }
  static addToSequence(e, n, s, i) {
    const r = _b.sequenceCache.get(e);
    if (!r) return false;
    const a2 = Qe(n, i).map((c, l) => ({
      index: s[l] ?? r.animationGroups.length,
      group: c
    }));
    return r.addGroups(a2), _b._registerSequenceElements(n, r), true;
  }
  static _registerSequenceElements(e, n) {
    for (const { target: s } of e) {
      const i = Array.isArray(s) ? s : s instanceof HTMLElement ? [s] : [];
      for (const r of i) {
        let o = _b.elementSequenceMap.get(r);
        o || (o = /* @__PURE__ */ new Set(), _b.elementSequenceMap.set(r, o)), o.add(n);
      }
    }
  }
  static removeFromSequences(e) {
    for (const n of e) {
      const s = _b.elementSequenceMap.get(n);
      if (s) {
        for (const i of s)
          i.removeGroups(
            (r) => r.animations.some((o) => o.effect?.target === n)
          );
        _b.elementSequenceMap.delete(n);
      }
    }
  }
};
var As = 0;
function P(t, {
  asCombinator: e = false,
  addItemFilter: n = false,
  useFirstChild: s = false
} = {}) {
  if (t.listContainer) {
    const i = `${n && t.listItemSelector ? ` > ${t.listItemSelector}` : ""}`;
    return t.selector ? `${t.listContainer}${i} ${t.selector}` : `${t.listContainer}${i || " > *"}`;
  } else if (t.selector)
    return t.selector;
  return s ? e ? "> :first-child" : ":scope > :first-child" : "";
}
function Ne(t) {
  return "sequenceId" in t && !("effects" in t);
}
function le(t, e) {
  return t[e] || (t[e] = {
    triggers: [],
    effects: {},
    sequences: {},
    interactionIds: /* @__PURE__ */ new Set(),
    selectors: /* @__PURE__ */ new Set()
  }), t[e];
}
function Cs(t, e = false) {
  const { effects: n = {}, sequences: s = {}, conditions: i = {} } = t, r = {};
  return t.interactions?.forEach((o) => {
    const a2 = o.key, c = ++As, { effects: l, sequences: f, ...u } = o;
    if (!a2) {
      console.error(`Interaction ${c} is missing a key for source element.`);
      return;
    }
    le(r, a2);
    const d = l ? Array.from(l) : [];
    d.reverse();
    const g = f?.map((h2) => {
      if (Ne(h2)) {
        const y = s[h2.sequenceId];
        return y ? { ...y, ...h2 } : (console.warn(`Interact: Sequence "${h2.sequenceId}" not found in config`), h2);
      }
      const v = h2;
      return v.sequenceId || (v.sequenceId = k()), v;
    }), p = {
      ...u,
      effects: d.length > 0 ? d : void 0,
      sequences: g
    };
    r[a2].triggers.push(p), r[a2].selectors.add(
      P(p, { useFirstChild: e })
    );
    const m = p.listContainer;
    d.forEach((h2) => {
      let v = h2.key;
      if (!v && h2.effectId) {
        const S2 = n[h2.effectId];
        S2 && (v = S2.key);
      }
      h2.effectId || (h2.effectId = k()), v = v || a2, h2.key = v;
      const y = h2.effectId;
      if (m && h2.listContainer && (v !== a2 || h2.listContainer !== m))
        return;
      const E = `${a2}::${v}::${y}::${c}`;
      if (h2.interactionId = E, r[a2].interactionIds.add(E), v === a2)
        return;
      const w2 = le(r, v);
      w2.effects[E] || (w2.effects[E] = [], w2.interactionIds.add(E)), w2.effects[E].push({ ...u, effect: h2 }), w2.selectors.add(P(h2, { useFirstChild: e }));
    }), g?.forEach((h2) => {
      if (!h2 || Ne(h2)) return;
      const v = h2, y = v.sequenceId || k(), E = v.effects;
      for (const w2 of E) {
        w2.effectId || (w2.effectId = k());
        let S2 = w2.key;
        if (!S2 && w2.effectId) {
          const I2 = n[w2.effectId];
          I2 && (S2 = I2.key);
        }
        S2 = S2 || a2;
        const T = P(w2, { useFirstChild: e });
        if (T && r[a2].selectors.add(T), S2 !== a2) {
          const I2 = le(r, S2), A3 = `${S2}::seq::${y}::${c}`;
          I2.sequences[A3] || (I2.sequences[A3] = [], I2.interactionIds.add(A3)), I2.sequences[A3].push({
            ...u,
            sequence: v
          }), I2.selectors.add(T);
        }
      }
    });
  }), {
    effects: n,
    sequences: s,
    conditions: i,
    interactions: r
  };
}
function ye(t, e, n) {
  if (t.listContainer) {
    const s = e.querySelector(t.listContainer);
    return s ? t.selector ? Array.from(s.querySelectorAll(t.selector)) : Array.from(s.children) : (console.warn(`Interact: No container found for list container "${t.listContainer}"`), []);
  }
  if (t.selector) {
    const s = e.querySelectorAll(t.selector);
    if (s.length > 0)
      return Array.from(s);
    console.warn(`Interact: No elements found for selector "${t.selector}"`);
  }
  return n ? e.firstElementChild : e;
}
function Ee(t, e) {
  return e.map((n) => t.selector ? n.querySelector(t.selector) : n).filter(Boolean);
}
function st(t, e, n, s, i, r, o, a2) {
  return [
    o ? Ee(t, o) : ye(t, n, s),
    a2 ? Ee(e, a2) : ye(e, i, r)
  ];
}
function it(t, e, n, s, i, r, o, a2) {
  const c = Array.isArray(s), l = Array.isArray(i);
  c ? s.forEach((f, u) => {
    const d = l ? i[u] : i;
    d && ze(
      t,
      f,
      e.trigger,
      d,
      n,
      e.params,
      r,
      o,
      a2
    );
  }) : (l ? i : [i]).forEach((u) => {
    ze(
      t,
      s,
      e.trigger,
      u,
      n,
      e.params,
      r,
      o,
      a2
    );
  });
}
function rt(t, e, n, s, i) {
  const r = {}, o = [];
  (s.effects || []).forEach((a2) => {
    const c = a2.effectId, l = {
      ...n.dataCache.effects[c] || {},
      ...a2,
      effectId: c
    }, f = l.key, u = $(a2.interactionId, t);
    if (r[u] || n.addedInteractions[u] && !i)
      return;
    const d = _(l.conditions || [], n.dataCache.conditions);
    if (d && n.setupMediaQueryListener(u, d, t, () => {
      e.update();
    }), !d || d.matches) {
      r[u] = true;
      const g = f && $(f, t);
      let p;
      if (g) {
        if (p = b.getController(g), !p)
          return;
        l.listContainer && p.watchChildList(l.listContainer);
      } else
        p = e;
      const [m, h2] = st(
        s,
        l,
        e.element,
        e.useFirstChild,
        p.element,
        p.useFirstChild,
        i
      );
      if (!m || !h2)
        return;
      n.addedInteractions[u] = true;
      const v = g || s.key, y = L(
        l.conditions || [],
        n.dataCache.conditions
      );
      o.push([
        v,
        s,
        l,
        m,
        h2,
        y,
        p.useFirstChild,
        t
      ]);
    }
  }), o.reverse().forEach((a2) => {
    it(...a2);
  }), $s(t, e, n, s, i);
}
function ks(t) {
  return "sequenceId" in t && !("effects" in t);
}
function ot(t, e, n, s, i, r, o) {
  const a2 = _(t.conditions || [], i.dataCache.conditions);
  if (a2 && i.setupMediaQueryListener(e, a2, r.updateKey, r.onUpdate), a2 && !a2.matches) return null;
  const c = t.effects || [], l = [];
  let f = false;
  for (const u of c) {
    const d = u.effectId, p = {
      ...d ? i.dataCache.effects[d] || {} : {},
      ...u
    }, m = _(p.conditions || [], i.dataCache.conditions);
    if (m) {
      const T = `${e}::${d || "eff"}`;
      i.setupMediaQueryListener(
        T,
        m,
        r.updateKey,
        r.onUpdate
      );
    }
    if (m && !m.matches) continue;
    const h2 = p.key, v = h2 && $(h2, n);
    let y;
    if (v) {
      if (y = b.getController(v), !y) return null;
    } else
      y = s;
    const E = v || n;
    let w2;
    if (o && E === o.controllerKey && p.listContainer === o.listContainer ? (w2 = Ee(p, o.elements), w2.length > 0 && (f = true)) : w2 = ye(
      p,
      y.element,
      y.useFirstChild
    ), !w2 || Array.isArray(w2) && w2.length === 0) return null;
    const S2 = q(p);
    l.push({ target: w2, options: S2 });
  }
  return o && !f ? null : l.length > 0 ? l : null;
}
function at(t, e, n) {
  const r = (t.useFirstChild ? t.element.firstElementChild : t.element)?.querySelector(e);
  if (!r) return n.map((a2, c) => c);
  const o = Array.from(r.children);
  return n.map((a2) => {
    const c = o.indexOf(a2);
    return c >= 0 ? c : o.length;
  });
}
function $s(t, e, n, s, i) {
  s.sequences?.forEach((r) => {
    let o;
    if (ks(r)) {
      const g = n.dataCache.sequences[r.sequenceId];
      if (!g) {
        console.warn(`Interact: Sequence "${r.sequenceId}" not found in cache`);
        return;
      }
      o = { ...g, ...r };
    } else
      o = r;
    const a2 = o.sequenceId || k(), c = $(`${t}::seq::${a2}`, t);
    if (n.addedInteractions[c] && !i) return;
    const l = i && s.listContainer ? { controllerKey: t, listContainer: s.listContainer, elements: i } : void 0, f = ot(
      o,
      c,
      t,
      e,
      n,
      { updateKey: t, onUpdate: () => e.update() },
      l
    );
    if (!f) return;
    if (i && n.addedInteractions[c]) {
      const g = at(
        e,
        s.listContainer,
        i
      );
      b.addToSequence(c, f, g, {
        reducedMotion: b.forceReducedMotion
      });
      return;
    }
    const u = b.getSequence(c, o, f, {
      reducedMotion: b.forceReducedMotion
    });
    n.addedInteractions[c] = true;
    const d = L(
      s.conditions || [],
      n.dataCache.conditions
    );
    x[s.trigger]?.add(
      e.element,
      e.element,
      { triggerType: o.triggerType },
      s.params || {},
      {
        reducedMotion: b.forceReducedMotion,
        selectorCondition: d,
        animation: u,
        allowA11yTriggers: b.allowA11yTriggers
      }
    );
  });
}
function _s(t, e, n, s, i) {
  const r = n.get(t)?.sequences || {};
  Object.keys(r).forEach((a2) => {
    r[a2].some(({ sequence: l, ...f }) => {
      const u = _(
        f.conditions || [],
        n.dataCache.conditions
      );
      if (u && !u.matches)
        return false;
      const d = f.key && $(f.key, t), g = b.getController(d);
      if (!g)
        return true;
      const p = l.sequenceId || k(), m = $(`${d}::seq::${p}`, d);
      if (n.addedInteractions[m] && !i)
        return true;
      const v = ot(
        l,
        m,
        d,
        g,
        n,
        { updateKey: t, onUpdate: () => e.update() },
        i && s ? { controllerKey: t, listContainer: s, elements: i } : void 0
      );
      if (!v) return true;
      if (i && n.addedInteractions[m]) {
        const w2 = at(e, s, i);
        return b.addToSequence(m, v, w2, {
          reducedMotion: b.forceReducedMotion
        }), true;
      }
      const y = b.getSequence(m, l, v, {
        reducedMotion: b.forceReducedMotion
      });
      n.addedInteractions[m] = true;
      const E = L(
        f.conditions || [],
        n.dataCache.conditions
      );
      return x[f.trigger]?.add(
        g.element,
        g.element,
        { triggerType: l.triggerType },
        f.params || {},
        {
          reducedMotion: b.forceReducedMotion,
          selectorCondition: E,
          animation: y,
          allowA11yTriggers: b.allowA11yTriggers
        }
      ), true;
    });
  });
}
function ct(t, e, n, s, i) {
  const r = n.get(t), o = r?.effects || {}, a2 = Object.keys(o), c = [];
  a2.forEach((f) => {
    const u = $(f, t);
    if (n.addedInteractions[u] && !i)
      return;
    o[f].some(({ effect: g, ...p }) => {
      const m = _(
        p.conditions || [],
        n.dataCache.conditions
      );
      if (m && !m.matches)
        return false;
      const h2 = g.effectId, v = {
        ...n.dataCache.effects[h2] || {},
        ...g,
        effectId: h2
      };
      if (s && v.listContainer !== s)
        return false;
      const y = _(v.conditions || [], n.dataCache.conditions);
      if (y && n.setupMediaQueryListener(u, y, t, () => {
        e.update();
      }), !y || y.matches) {
        const E = p.key && $(p.key, t), w2 = b.getController(E);
        if (!w2)
          return true;
        v.listContainer && e.watchChildList(v.listContainer);
        const [S2, T] = st(
          p,
          v,
          w2.element,
          w2.useFirstChild,
          e.element,
          e.useFirstChild,
          void 0,
          i
        );
        if (!S2 || !T)
          return true;
        n.addedInteractions[u] = true;
        const I2 = L(
          v.conditions || [],
          n.dataCache.conditions
        );
        return c.push([
          t,
          p,
          v,
          S2,
          T,
          I2,
          e.useFirstChild,
          E || void 0
        ]), true;
      }
      return false;
    });
  }), c.reverse().forEach((f) => {
    it(...f);
  }), _s(t, e, n, s, i);
  const l = Object.keys(r?.sequences || {}).length > 0;
  return a2.length > 0 || l;
}
function ze(t, e, n, s, i, r, o, a2, c) {
  let l;
  if (i.transition || i.transitionProperties) {
    const u = {
      key: t,
      effectId: i.effectId,
      transition: i.transition,
      transitionProperties: i.transitionProperties,
      childSelector: P(i, {
        asCombinator: true,
        addItemFilter: true,
        useFirstChild: a2
      }),
      selectorCondition: o
    };
    if (l = b.getController(t), !l)
      return;
    l.renderStyle(gn(u));
  }
  let f;
  if (n === "animationEnd") {
    const u = r.effectId, g = (c ? b.getInstance(c) : void 0)?.dataCache.effects[u];
    g && (f = q(g));
  }
  x[n]?.add(e, s, i, r, {
    reducedMotion: b.forceReducedMotion,
    targetController: l,
    selectorCondition: o,
    allowA11yTriggers: b.allowA11yTriggers,
    sourceAnimationOptions: f
  });
}
function qs(t) {
  const e = t.key, n = b.getInstance(e);
  if (!n)
    return console.warn(`No instance found for key: ${e}`), b.setController(e, t), false;
  const { triggers: s = [] } = n?.get(e) || {}, i = s.length > 0;
  n.setController(e, t), s.forEach((o, a2) => {
    const c = _(o.conditions, n.dataCache.conditions);
    if (c) {
      const l = `${e}::trigger::${a2}`;
      n.setupMediaQueryListener(l, c, e, () => {
        t.update();
      });
    }
    (!c || c.matches) && (o.listContainer && t.watchChildList(o.listContainer), rt(e, t, n, o));
  });
  let r = false;
  return n && (r = ct(e, t, n)), i || r;
}
function Ms(t, e, n) {
  const s = t.key, i = b.getInstance(s);
  if (i) {
    const { triggers: r = [] } = i?.get(s) || {};
    r.forEach((o, a2) => {
      if (o.listContainer !== e)
        return;
      const c = _(o.conditions, i.dataCache.conditions);
      if (c) {
        const l = `${s}::listTrigger::${e}::${a2}`;
        i.setupMediaQueryListener(l, c, s, () => {
          t.update();
        });
      }
      (!c || c.matches) && rt(s, t, i, o, n);
    }), ct(s, t, i, e, n);
  }
}
function xs(t, e = false) {
  const n = t.key, s = b.getInstance(n);
  if (!s)
    return;
  const i = [...s.get(n)?.selectors.values() || []].filter(Boolean).join(",");
  let r;
  i ? (r = [...t.element.querySelectorAll(i)], t.useFirstChild || r.push(t.element)) : r = [t.element], ft(r), s.deleteController(n, e);
}
function ft(t) {
  const e = Object.values(x);
  for (const n of t)
    for (const s of e)
      s.remove(n);
  b.removeFromSequences(t);
}
var ue = "interactEffect";
var Ps = class {
  element;
  key;
  connected;
  sheet;
  useFirstChild;
  _observers;
  constructor(e, n, s) {
    this.element = e, this.key = n, this.connected = false, this.sheet = null, this._observers = /* @__PURE__ */ new WeakMap(), this.useFirstChild = s?.useFirstChild ?? false;
  }
  connect(e) {
    if (this.connected)
      return;
    const n = this.element.dataset.interactKey;
    if (e = e || this.key || n, !e) {
      console.warn("Interact: No key provided");
      return;
    }
    n !== e && (n && console.warn(
      `Interact: Key mismatch between element ${n} and parameter ${e}, updating element key`
    ), this.element.dataset.interactKey = e), this.key = e, this.connected = qs(this);
  }
  disconnect({ removeFromCache: e = false } = {}) {
    if ((this.key || this.element.dataset.interactKey) && xs(this, e), this.sheet) {
      const s = this.element?.getRootNode(), i = s.host ? s : document;
      i.adoptedStyleSheets.indexOf(this.sheet) !== -1 && (i.adoptedStyleSheets = i.adoptedStyleSheets.filter(
        (o) => o !== this.sheet
      ));
    }
    this._observers = /* @__PURE__ */ new WeakMap(), this.sheet = null, this.connected = false;
  }
  update() {
    this.disconnect(), this.connect();
  }
  renderStyle(e) {
    const n = this.element?.getRootNode(), s = n.host ? n : document;
    if (!this.sheet)
      this.sheet = new CSSStyleSheet(), this.sheet.replaceSync(e.join(`
`)), s.adoptedStyleSheets = [...s.adoptedStyleSheets || [], this.sheet];
    else {
      let i = this.sheet.cssRules.length;
      for (const r of e)
        try {
          this.sheet.insertRule(r, i), i++;
        } catch (o) {
          console.error(o);
        }
    }
  }
  toggleEffect(e, n, s, i) {
    if (s === null)
      return;
    if (!i && this.element.toggleEffect) {
      this.element.toggleEffect(e, n, s);
      return;
    }
    const r = new Set(
      this.element.dataset[ue]?.split(" ") || []
    );
    n === "toggle" ? r.has(e) ? r.delete(e) : r.add(e) : n === "add" ? r.add(e) : n === "remove" ? r.delete(e) : n === "clear" && r.clear(), (s || this.element).dataset[ue] = Array.from(r).join(" ");
  }
  getActiveEffects() {
    const n = (this.element.dataset[ue] || "").trim();
    return n ? n.split(/\s+/) : [];
  }
  watchChildList(e) {
    const n = this.element.querySelector(e);
    if (n) {
      let s = this._observers.get(n);
      s || (s = new MutationObserver(this._childListChangeHandler.bind(this, e)), this._observers.set(n, s), s.observe(n, { childList: true }));
    }
  }
  _childListChangeHandler(e, n) {
    const s = this.key || this.element.dataset.interactKey, i = [], r = [];
    n.forEach((o) => {
      o.removedNodes.forEach((a2) => {
        a2 instanceof HTMLElement && i.push(a2);
      }), o.addedNodes.forEach((a2) => {
        a2 instanceof HTMLElement && r.push(a2);
      });
    }), ft(i), s && Ms(this, e, r);
  }
};
function Us(t, e) {
  new Ps(t, e).connect();
}
var se = [
  "animation",
  "animation-composition",
  "animation-timeline",
  "animation-range"
];
var we = ["transition", ...se];

// ../../../Documents/Dev/Wix/interact-xp/node_modules/@wix/motion-presets/dist/es/motion-presets.js
var motion_presets_exports = {};
__export(motion_presets_exports, {
  AiryMouse: () => yi,
  ArcIn: () => yc,
  ArcScroll: () => Qi,
  BgCloseUp: () => bi,
  BgFade: () => Ai,
  BgFadeBack: () => wi,
  BgFake3D: () => Ni,
  BgPan: () => Di,
  BgParallax: () => ki,
  BgPullBack: () => Fi,
  BgReveal: () => Pi,
  BgRotate: () => Ri,
  BgSkew: () => Mi,
  BgZoom: () => Yi,
  BlobMouse: () => vi,
  BlurIn: () => vc,
  BlurMouse: () => _i,
  BlurScroll: () => Wi,
  Bounce: () => Ci,
  BounceIn: () => hc,
  BounceMouse: () => hi,
  Breathe: () => zi,
  Cross: () => Li,
  CurveIn: () => Ec,
  CustomMouse: () => pi,
  DropIn: () => Oc,
  ExpandIn: () => xc,
  FadeIn: () => Ic,
  FadeScroll: () => tc,
  Flash: () => Xi,
  Flip: () => Ui,
  FlipIn: () => Sc,
  FlipScroll: () => ec,
  FloatIn: () => Tc,
  Fold: () => Bi,
  FoldIn: () => bc,
  GlideIn: () => Ac,
  GrowScroll: () => oc,
  ImageParallax: () => ji,
  Jello: () => Zi,
  MoveScroll: () => nc,
  PanScroll: () => rc,
  ParallaxScroll: () => ac,
  Poke: () => Gi,
  Pulse: () => Ki,
  RevealIn: () => Nc,
  RevealScroll: () => sc,
  Rubber: () => Vi,
  ScaleMouse: () => Ei,
  ShapeIn: () => wc,
  ShapeScroll: () => ic,
  ShrinkScroll: () => lc,
  ShuttersIn: () => _c,
  ShuttersScroll: () => cc,
  SkewMouse: () => Oi,
  SkewPanScroll: () => fc,
  SlideIn: () => Dc,
  SlideScroll: () => mc,
  Spin: () => Hi,
  Spin3dScroll: () => uc,
  SpinIn: () => kc,
  SpinMouse: () => xi,
  SpinScroll: () => dc,
  StretchScroll: () => gc,
  Swing: () => qi,
  SwivelMouse: () => Ii,
  Tilt3DMouse: () => Si,
  TiltIn: () => Fc,
  TiltScroll: () => $c,
  Track3DMouse: () => Ti,
  TrackMouse: () => Sn2,
  TurnIn: () => Pc,
  TurnScroll: () => pc,
  Wiggle: () => Ji,
  WinkIn: () => Rc
});

// ../../../Documents/Dev/Wix/interact-xp/node_modules/@wix/motion/dist/es/motion.js
var U2 = (e) => e < 0.5 ? 2 * e ** 2 : 1 - (-2 * e + 2) ** 2 / 2;
var mt = (e) => e < 0.5 ? (1 - Math.sqrt(1 - 4 * e ** 2)) / 2 : (Math.sqrt(-(2 * e - 3) * (2 * e - 1)) + 1) / 2;
var z2 = {
  linear: "linear",
  ease: "ease",
  easeIn: "ease-in",
  easeOut: "ease-out",
  easeInOut: "ease-in-out",
  sineIn: "cubic-bezier(0.47, 0, 0.745, 0.715)",
  sineOut: "cubic-bezier(0.39, 0.575, 0.565, 1)",
  sineInOut: "cubic-bezier(0.445, 0.05, 0.55, 0.95)",
  quadIn: "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
  quadOut: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  quadInOut: "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
  cubicIn: "cubic-bezier(0.55, 0.055, 0.675, 0.19)",
  cubicOut: "cubic-bezier(0.215, 0.61, 0.355, 1)",
  cubicInOut: "cubic-bezier(0.645, 0.045, 0.355, 1)",
  quartIn: "cubic-bezier(0.895, 0.03, 0.685, 0.22)",
  quartOut: "cubic-bezier(0.165, 0.84, 0.44, 1)",
  quartInOut: "cubic-bezier(0.77, 0, 0.175, 1)",
  quintIn: "cubic-bezier(0.755, 0.05, 0.855, 0.06)",
  quintOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  quintInOut: "cubic-bezier(0.86, 0, 0.07, 1)",
  expoIn: "cubic-bezier(0.95, 0.05, 0.795, 0.035)",
  expoOut: "cubic-bezier(0.19, 1, 0.22, 1)",
  expoInOut: "cubic-bezier(1, 0, 0, 1)",
  circIn: "cubic-bezier(0.6, 0.04, 0.98, 0.335)",
  circOut: "cubic-bezier(0.075, 0.82, 0.165, 1)",
  circInOut: "cubic-bezier(0.785, 0.135, 0.15, 0.86)",
  backIn: "cubic-bezier(0.6, -0.28, 0.735, 0.045)",
  backOut: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  backInOut: "cubic-bezier(0.68, -0.55, 0.265, 1.55)"
};
var A = { exports: {} };
var F2 = A.exports;
var x2;
function It2() {
  return x2 || (x2 = 1, (function(e) {
    (function(t) {
      var n = function() {
      }, i = t.requestAnimationFrame || t.webkitRequestAnimationFrame || t.mozRequestAnimationFrame || t.msRequestAnimationFrame || function(o) {
        return setTimeout(o, 16);
      };
      function s() {
        var o = this;
        o.reads = [], o.writes = [], o.raf = i.bind(t);
      }
      s.prototype = {
        constructor: s,
        /**
         * We run this inside a try catch
         * so that if any jobs error, we
         * are able to recover and continue
         * to flush the batch until it's empty.
         *
         * @param {Array} tasks
         */
        runTasks: function(o) {
          for (var u; u = o.shift(); ) u();
        },
        /**
         * Adds a job to the read batch and
         * schedules a new frame if need be.
         *
         * @param  {Function} fn
         * @param  {Object} ctx the context to be bound to `fn` (optional).
         * @public
         */
        measure: function(o, u) {
          var f = u ? o.bind(u) : o;
          return this.reads.push(f), r(this), f;
        },
        /**
         * Adds a job to the
         * write batch and schedules
         * a new frame if need be.
         *
         * @param  {Function} fn
         * @param  {Object} ctx the context to be bound to `fn` (optional).
         * @public
         */
        mutate: function(o, u) {
          var f = u ? o.bind(u) : o;
          return this.writes.push(f), r(this), f;
        },
        /**
         * Clears a scheduled 'read' or 'write' task.
         *
         * @param {Object} task
         * @return {Boolean} success
         * @public
         */
        clear: function(o) {
          return a2(this.reads, o) || a2(this.writes, o);
        },
        /**
         * Extend this FastDom with some
         * custom functionality.
         *
         * Because fastdom must *always* be a
         * singleton, we're actually extending
         * the fastdom instance. This means tasks
         * scheduled by an extension still enter
         * fastdom's global task queue.
         *
         * The 'super' instance can be accessed
         * from `this.fastdom`.
         *
         * @example
         *
         * var myFastdom = fastdom.extend({
         *   initialize: function() {
         *     // runs on creation
         *   },
         *
         *   // override a method
         *   measure: function(fn) {
         *     // do extra stuff ...
         *
         *     // then call the original
         *     return this.fastdom.measure(fn);
         *   },
         *
         *   ...
         * });
         *
         * @param  {Object} props  properties to mixin
         * @return {FastDom}
         */
        extend: function(o) {
          if (typeof o != "object") throw new Error("expected object");
          var u = Object.create(this);
          return m(u, o), u.fastdom = this, u.initialize && u.initialize(), u;
        },
        // override this with a function
        // to prevent Errors in console
        // when tasks throw
        catch: null
      };
      function r(o) {
        o.scheduled || (o.scheduled = true, o.raf(c.bind(null, o)));
      }
      function c(o) {
        var u = o.writes, f = o.reads, p;
        try {
          n("flushing reads", f.length), o.runTasks(f), n("flushing writes", u.length), o.runTasks(u);
        } catch (h2) {
          p = h2;
        }
        if (o.scheduled = false, (f.length || u.length) && r(o), p)
          if (n("task errored", p.message), o.catch) o.catch(p);
          else throw p;
      }
      function a2(o, u) {
        var f = o.indexOf(u);
        return !!~f && !!o.splice(f, 1);
      }
      function m(o, u) {
        for (var f in u)
          u.hasOwnProperty(f) && (o[f] = u[f]);
      }
      var l = t.fastdom = t.fastdom || new s();
      e.exports = l;
    })(typeof window < "u" ? window : typeof F2 < "u" ? F2 : globalThis);
  })(A)), A.exports;
}
var Ot2 = It2();

// ../../../Documents/Dev/Wix/interact-xp/node_modules/@wix/motion-presets/dist/es/motion-presets.js
function h(t, e, o, n, r) {
  return (r - t) * (n - o) / (e - t) + o;
}
function on([t, e], [o, n]) {
  return Math.sqrt((o - t) ** 2 + (n - e) ** 2);
}
function nn(t = [0, 0], e = [0, 0], o = 0) {
  const n = Math.atan2(e[1] - t[1], e[0] - t[0]) * 180 / Math.PI;
  return (360 + o + n) % 360;
}
var rn = {
  initial: ({ top: t, bottom: e, left: o, right: n }) => `${o}% ${t}%, ${n}% ${t}%, ${n}% ${e}%, ${o}% ${e}%`,
  top: ({ top: t, left: e, right: o, minimum: n }) => `${e}% ${t}%, ${o}% ${t}%, ${o}% ${t + n}%, ${e}% ${t + n}%`,
  right: ({ top: t, bottom: e, right: o, minimum: n }) => `${o - n}% ${t}%, ${o}% ${t}%, ${o}% ${e}%, ${o - n}% ${e}%`,
  center: ({ centerX: t, centerY: e, minimum: o }) => `${t - o / 2}% ${e - o / 2}%, ${t + o / 2}% ${e - o / 2}%, ${t + o / 2}% ${e + o / 2}%, ${t - o / 2}% ${e + o / 2}%`,
  bottom: ({ bottom: t, left: e, right: o, minimum: n }) => `${e}% ${t - n}%, ${o}% ${t - n}%, ${o}% ${t}%, ${e}% ${t}%`,
  left: ({ top: t, bottom: e, left: o, minimum: n }) => `${o}% ${t}%, ${o + n}% ${t}%, ${o + n}% ${e}%, ${o}% ${e}%`,
  vertical: ({ top: t, bottom: e, left: o, right: n, minimum: r }) => `${o}% ${t + r / 2}%, ${n}% ${t + r / 2}%, ${n}% ${e - r / 2}%, ${o}% ${e - r / 2}%`,
  horizontal: ({ top: t, bottom: e, left: o, right: n, minimum: r }) => `${o + r / 2}% ${t}%, ${n - r / 2}% ${t}%, ${n - r / 2}% ${e}%, ${o + r / 2}% ${e}%`
};
function R2({
  direction: t,
  scaleX: e = 1,
  scaleY: o = 1,
  minimum: n = 0
}) {
  const r = (1 - o) / 2 * 100, s = (1 - e) / 2 * 100, i = 100 + s - (1 - e) * 100, l = 100 + r - (1 - o) * 100, f = (i + s) / 2, m = (l + r) / 2;
  return `polygon(${rn[t]({
    top: r,
    bottom: l,
    left: s,
    right: i,
    centerX: f,
    centerY: m,
    minimum: n
  })})`;
}
var G = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
var z3 = ["bottom", "left", "top", "right"];
function V2(t, e) {
  const o = Math.max(0, t.indexOf(e)), n = t.length;
  return t[(o + (n >> 1)) % n];
}
function vt2(t, e) {
  return e === "out" ? G : R2({
    direction: V2(z3, t)
  });
}
function _t2(t, e) {
  return e === "in" ? G : R2({
    direction: e === "out" ? V2(z3, t) : t
  });
}
function an2(t, e) {
  const o = t * Math.PI / 180, n = Math.cos(o) * e, r = Math.sin(o) * e;
  return [n, r];
}
function N2(t) {
  return t === "percentage" ? "%" : t || "px";
}
function S(t) {
  return t ? z2[t] || t : z2.linear;
}
function K2(t) {
  if (!z2[t])
    return {
      in: t,
      inOut: t,
      out: t
    };
  const e = t.replace(/In|Out/g, "");
  return e === "linear" ? {
    in: "linear",
    inOut: "linear",
    out: "linear"
  } : {
    in: `${e}In`,
    inOut: `${e}InOut`,
    out: `${e}Out`
  };
}
var sn = {
  linear: "linear",
  easeOut: "ease-out",
  hardBackOut: "cubic-bezier(0.58, 2.5, 0, 0.95)",
  elastic: "linear( 0, 0.2178 2.1%, 1.1144 8.49%, 1.2959 10.7%, 1.3463 11.81%, 1.3705 12.94%, 1.3726, 1.3643 14.48%, 1.3151 16.2%, 1.0317 21.81%, 0.941 24.01%, 0.8912 25.91%, 0.8694 27.84%, 0.8698 29.21%, 0.8824 30.71%, 1.0122 38.33%, 1.0357, 1.046 42.71%, 1.0416 45.7%, 0.9961 53.26%, 0.9839 57.54%, 0.9853 60.71%, 1.0012 68.14%, 1.0056 72.24%, 0.9981 86.66%, 1 )",
  bounce: "linear( 0, 0.0039, 0.0157, 0.0352, 0.0625 9.09%, 0.1407, 0.25, 0.3908, 0.5625, 0.7654, 1, 0.8907, 0.8125 45.45%, 0.7852, 0.7657, 0.7539, 0.75, 0.7539, 0.7657, 0.7852, 0.8125 63.64%, 0.8905, 1 72.73%, 0.9727, 0.9532, 0.9414, 0.9375, 0.9414, 0.9531, 0.9726, 1, 0.9883, 0.9844, 0.9883, 1 )"
};
function k2(t) {
  return t && sn[t] || "linear";
}
function cn2(t, e) {
  let o = t.offsetLeft, n = t.offsetTop, r = t.offsetParent;
  for (; r && !(e && r === e); )
    o += r.offsetLeft, n += r.offsetTop, r = r.offsetParent;
  return { left: o, top: n };
}
var ln2 = (t, e, o) => {
  const n = t === "top" || t === "left", r = n ? e : 0, s = n ? 0 : e, i = n ? -1 : 1, l = t === "top" || t === "bottom", f = [], m = [];
  for (let c = r; c !== s; c += i) {
    const d = 100 * ((c + i) / e), u = 100 * (c / e) | 0;
    let g;
    if (o) {
      const p = n ? 1 + (e - c) / e : 1 + c / e;
      g = n ? 100 - (100 - d) * p : d * p;
    } else
      g = d;
    g |= 0, l ? (f.push(
      `0% ${u}%, 100% ${u}%, 100% ${u}%, 0% ${u}%`
    ), m.push(`0% ${u}%, 100% ${u}%, 100% ${g}%, 0% ${g}%`)) : (f.push(
      `${u}% 0%, ${u}% 100%, ${u}% 100%, ${u}% 0%`
    ), m.push(`${u}% 0%, ${u}% 100%, ${g}% 100%, ${g}% 0%`));
  }
  return { start: f, end: m };
};
function tt2(t, e, o, n) {
  const { start: r, end: s } = ln2(t, e, o);
  return n && (r.reverse(), s.reverse()), {
    clipStart: `polygon(${r.join(", ")})`,
    clipEnd: `polygon(${s.join(", ")})`
  };
}
function D2(t, e = 2) {
  return parseFloat(t.toFixed(e));
}
function a(t, e, o = false, n = void 0) {
  return o ? t[e] : `var(${e}${n !== void 0 ? `, ${n}` : ""})`;
}
function I(t, e, o = false) {
  const n = t || 1, s = D2(n / (n + (e || 0)));
  return o ? s.toString().replace(/\./g, "") : s;
}
var fn2 = /^(-?\d*\.?\d+)(px|%|em|rem|vw|vh|vmin|vmax|ch|ex|cm|mm|in|pt|pc)$/i;
function rt2(t) {
  const e = t.toLowerCase();
  return e === "%" ? "percentage" : e;
}
function A2(t, e) {
  if (t == null)
    return e;
  if (typeof t == "number")
    return { value: t, unit: e.unit };
  if (typeof t == "object" && "value" in t && "unit" in t) {
    const o = typeof t.value == "string" ? parseFloat(t.value) : t.value;
    return typeof o == "number" && !isNaN(o) && typeof t.unit == "string" ? { value: o, unit: rt2(t.unit) } : e;
  }
  if (typeof t == "string") {
    const o = t.trim(), n = o.match(fn2);
    if (n)
      return { value: parseFloat(n[1]), unit: rt2(n[2]) };
    if (o !== "") {
      const r = Number(o);
      if (!isNaN(r))
        return { value: r, unit: e.unit };
    }
  }
  return e;
}
function _2(t, e, o, n = false) {
  if (t == null)
    return o;
  if (typeof t == "number")
    return n ? t : o;
  if (typeof t == "string") {
    const r = t.trim().toLowerCase();
    if (e.includes(r))
      return r;
    if (n) {
      const s = r.match(/^(-?\d*\.?\d+)deg$/i);
      if (s)
        return parseFloat(s[1]);
      if (r !== "") {
        const i = Number(r);
        if (!isNaN(i))
          return i;
      }
    }
  }
  return o;
}
var F3 = class {
  target;
  options;
  currentProgress;
  constructor(e, o) {
    this.target = e, this.options = o || {}, this.currentProgress = { x: 0.5, y: 0.5, v: { x: 0, y: 0 }, active: true }, this.play();
  }
  progress({ x: e, y: o, v: n, active: r }) {
    this.currentProgress = { x: e, y: o, v: n, active: r }, typeof this.options.customEffect == "function" && this.options.customEffect(this.target, this.currentProgress);
  }
  cancel() {
    this.currentProgress = { x: 0.5, y: 0.5, v: { x: 0, y: 0 } };
  }
  getProgress() {
    return this.currentProgress;
  }
  play() {
    this.options.transition && this.target && (this.target.style.transition = this.options.transition);
  }
};
function pi(t) {
  return (e) => new F3(e, t);
}
var mn = { value: 200, unit: "px" };
var un = 30;
var dn = "both";
var gn2 = ["both", "horizontal", "vertical"];
var $n2 = class extends F3 {
  progress({ x: e, y: o }) {
    let n = 0, r = 0;
    const { distance: s, invert: i, angle: l, axis: f } = this.options;
    f !== "vertical" && (n = h(0, 1, -s.value, s.value, e) * i), f !== "horizontal" && (r = h(0, 1, -s.value, s.value, o) * i);
    const m = h(0, 1, -l, l, e) * i, c = N2(s.unit);
    this.target.style.transform = `translateX(${n}${c}) translateY(${r}${c}) rotate(calc(${m}deg + var(--motion-rotate, 0deg)))`;
  }
  cancel() {
    this.target.style.transform = "", this.target.style.transition = "";
  }
};
function yi(t) {
  const { transitionDuration: e, transitionEasing: o } = t, n = t.namedEffect, r = n.inverted ?? false, s = A2(n.distance, mn), i = _2(n.angle, [], un, true), l = _2(n.axis, gn2, dn), f = r ? -1 : 1, m = {
    transition: e ? `transform ${e}ms ${k2(o)}` : "",
    invert: f,
    distance: s,
    angle: i,
    axis: l
  };
  return (c) => new $n2(c, m);
}
var pn = { value: 200, unit: "px" };
var yn2 = class extends F3 {
  progress({ x: e, y: o }) {
    const { distance: n, scale: r, invert: s } = this.options, i = h(0, 1, -n.value, n.value, e) * s, l = h(0, 1, -n.value, n.value, o) * s, f = e < 0.5 ? h(0, 0.5, r, 1, e) : h(0.5, 1, 1, r, e), m = o < 0.5 ? h(0, 0.5, r, 1, o) : h(0.5, 1, 1, r, o), c = N2(n.unit);
    this.target.style.transform = `translateX(${i}${c}) translateY(${l}${c}) scale(${f}, ${m}) rotate(var(--motion-rotate, 0deg))`;
  }
  cancel() {
    this.target.style.transform = "", this.target.style.transition = "";
  }
};
function vi(t) {
  const { transitionDuration: e, transitionEasing: o } = t, n = t.namedEffect, { inverted: r = false, scale: s = 1.4 } = n, i = A2(n.distance, pn), l = r ? -1 : 1, f = {
    transition: e ? `transform ${e}ms ${k2(o)}` : "",
    invert: l,
    distance: i,
    scale: s
  };
  return (m) => new yn2(m, f);
}
var vn2 = { value: 80, unit: "px" };
var _n2 = 5;
var hn = class extends F3 {
  progress({ x: e, y: o }) {
    const { distance: n, angle: r, scale: s, invert: i, blur: l, perspective: f } = this.options, m = h(0, 1, -n.value, n.value, e) * i, c = h(0, 1, -n.value, n.value, o) * i, d = e < 0.5 ? h(0, 0.5, s, 1, e) : h(0.5, 1, 1, s, e), u = o < 0.5 ? h(0, 0.5, s, 1, o) : h(0.5, 1, 1, s, o), g = Math.min(d, u), p = h(0, 1, -r, r, o) * i, $2 = h(0, 1, r, -r, e) * i, v = N2(n.unit), y = `perspective(${f}px) translateX(${m}${v}) translateY(${c}${v}) scale(${g}, ${g}) rotateX(${p}deg) rotateY(${$2}deg) rotate(var(--motion-rotate, 0deg))`, O2 = on([0.5, 0.5], [e, o]), T = `blur(${Math.round(h(0, 1, 0, l, U2(O2)))}px)`;
    this.target.style.transform = y, this.target.style.filter = T;
  }
  cancel() {
    this.target.style.transform = "", this.target.style.filter = "", this.target.style.transition = "";
  }
};
function _i(t) {
  const { transitionDuration: e, transitionEasing: o } = t, n = t.namedEffect, r = n.inverted ?? false, s = A2(n.distance, vn2), i = _2(n.angle, [], _n2, true), { scale: l = 0.3, blur: f = 20, perspective: m = 600 } = n, c = r ? -1 : 1, d = {
    transition: e ? `transform ${e}ms ${k2(
      o
    )}, filter ${e}ms ${k2(o)}` : "",
    distance: s,
    angle: i,
    scale: l,
    blur: f,
    perspective: m,
    invert: c
  };
  return (u) => new hn(u, d);
}
var En2 = { value: 200, unit: "px" };
var On2 = "both";
var xn2 = ["both", "horizontal", "vertical"];
var In2 = class extends F3 {
  progress({ x: e, y: o }) {
    const { invert: n, distance: r, axis: s } = this.options;
    let i = 0, l = 0;
    (s === "both" || s === "horizontal") && (i = h(0, 1, -r.value, r.value, e) * n), (s === "both" || s === "vertical") && (l = h(0, 1, -r.value, r.value, o) * n);
    const f = N2(r.unit);
    this.target.style.transform = `translateX(${i}${f}) translateY(${l}${f}) rotate(var(--motion-rotate, 0deg))`;
  }
  cancel() {
    this.target.style.transform = "", this.target.style.transition = "";
  }
};
function Sn2(t) {
  const { transitionDuration: e, transitionEasing: o } = t, n = t.namedEffect, r = n.inverted ?? false, s = A2(n.distance, En2), i = _2(n.axis, xn2, On2), l = r ? -1 : 1, f = {
    transition: e ? `transform ${e}ms ${k2(o)}` : "",
    invert: l,
    distance: s,
    axis: i
  };
  return (m) => new In2(m, f);
}
var Tn2 = { value: 80, unit: "px" };
function hi(t) {
  const e = t.namedEffect, o = A2(e.distance, Tn2), { transitionEasing: n = "elastic" } = t;
  return Sn2({
    ...t,
    transitionEasing: n,
    namedEffect: { ...t.namedEffect, distance: o }
  });
}
var bn2 = { value: 80, unit: "px" };
var An2 = "both";
var wn2 = ["both", "horizontal", "vertical"];
var Nn2 = class extends F3 {
  progress({ x: e, y: o }) {
    const { distance: n, scale: r, invert: s, axis: i } = this.options;
    let l = 0, f = 0, m = 1, c = 1;
    (i === "both" || i === "horizontal") && (l = h(0, 1, -n.value, n.value, e) * s, m = e < 0.5 ? h(0, 0.5, r, 1, e) : h(0.5, 1, 1, r, e)), (i === "both" || i === "vertical") && (f = h(0, 1, -n.value, n.value, o) * s, c = o < 0.5 ? h(0, 0.5, r, 1, o) : h(0.5, 1, 1, r, o));
    const d = r < 1 ? Math.min(m, c) : Math.max(m, c), u = N2(n.unit);
    this.target.style.transform = `translateX(${l}${u}) translateY(${f}${u}) scale(${d}) rotate(var(--motion-rotate, 0deg))`;
  }
  cancel() {
    this.target.style.transform = "", this.target.style.transition = "";
  }
};
function Ei(t) {
  const { transitionDuration: e, transitionEasing: o } = t, n = t.namedEffect, r = n.inverted ?? false, s = A2(n.distance, bn2), i = _2(n.axis, wn2, An2), { scale: l = 1.4 } = n, f = r ? -1 : 1, m = {
    transition: e ? `transform ${e}ms ${k2(o)}` : "",
    invert: f,
    distance: s,
    axis: i,
    scale: l
  };
  return (c) => new Nn2(c, m);
}
var Dn2 = { value: 200, unit: "px" };
var kn2 = 25;
var Fn2 = "both";
var Pn2 = ["both", "horizontal", "vertical"];
var Rn2 = class extends F3 {
  progress({ x: e, y: o }) {
    let n = 0, r = 0, s = 0, i = 0;
    const { distance: l, angle: f, axis: m, invert: c } = this.options;
    m !== "vertical" && (n = h(0, 1, -l.value, l.value, e) * c, s = h(0, 1, f, -f, e) * c), m !== "horizontal" && (r = h(0, 1, -l.value, l.value, o) * c, i = h(0, 1, f, -f, o) * c), m === "both" && (s *= h(0, 1, 1, -1, mt(o)), i *= h(0, 1, 1, -1, mt(e)));
    const d = N2(l.unit), u = `translateX(${n}${d}) translateY(${r}${d}) skew(${s}deg, ${i}deg) rotate(var(--motion-rotate, 0deg))`;
    this.target.style.transform = u;
  }
  cancel() {
    this.target.style.transform = "", this.target.style.transition = "";
  }
};
function Oi(t) {
  const { transitionDuration: e, transitionEasing: o } = t, n = t.namedEffect, r = n.inverted ?? false, s = A2(n.distance, Dn2), i = _2(n.angle, [], kn2, true), l = _2(n.axis, Pn2, Fn2), f = r ? -1 : 1, m = {
    transition: e ? `transform ${e}ms ${k2(o)}` : "",
    invert: f,
    distance: s,
    angle: i,
    axis: l
  };
  return (c) => new Rn2(c, m);
}
var Mn2 = "both";
var Yn2 = ["both", "horizontal", "vertical"];
var jn2 = class extends F3 {
  progress({ x: e, y: o }) {
    const { invert: n, axis: r } = this.options, s = nn(
      [0.5, 0.5],
      [r === "vertical" ? 0 : e, r === "horizontal" ? 0 : o],
      90
    ) * n;
    this.target.style.transform = `rotate(calc(${s}deg + var(--motion-rotate, 0deg)))`;
  }
  cancel() {
    this.target.style.transform = "", this.target.style.transition = "";
  }
};
function xi(t) {
  const { transitionDuration: e, transitionEasing: o = "linear" } = t, n = t.namedEffect, r = n.inverted ?? false, s = _2(n.axis, Yn2, Mn2), i = r ? -1 : 1, l = {
    transition: e ? `transform ${e}ms ${k2(o)}` : "",
    invert: i,
    axis: s
  };
  return (f) => new jn2(f, l);
}
var Cn2 = 5;
var zn2 = "center-horizontal";
var Ln2 = ["top", "bottom", "right", "left", "center-horizontal", "center-vertical"];
var Xn2 = {
  top: [0, -50],
  bottom: [0, 50],
  right: [50, 0],
  left: [-50, 0],
  "center-horizontal": [0, 0],
  "center-vertical": [0, 0]
};
var Un2 = class extends F3 {
  progress({ x: e, y: o }) {
    let n = "rotateX", r = o, s = -1;
    const { pivotAxis: i, angle: l, invert: f, perspective: m } = this.options;
    (i === "center-horizontal" || i === "right" || i === "left") && (n = "rotateY", r = e, s = 1);
    const c = h(0, 1, -l, l, r) * s * f, [d, u] = Xn2[i], g = `perspective(${m}px) translateX(${d}%) translateY(${u}%) ${n}(${c}deg) translateX(${-d}%) translateY(${-u}%) rotate(var(--motion-rotate, 0deg))`;
    this.target.style.transform = g;
  }
  cancel() {
    this.target.style.transform = "", this.target.style.transition = "";
  }
};
function Ii(t) {
  const { transitionDuration: e, transitionEasing: o } = t, n = t.namedEffect, r = n.inverted ?? false, s = _2(n.angle, [], Cn2, true), i = _2(
    n.pivotAxis,
    Ln2,
    zn2
  ), { perspective: l = 800 } = n, f = r ? -1 : 1, m = {
    transition: e ? `transform ${e}ms ${k2(o)}` : "",
    invert: f,
    angle: s,
    perspective: l,
    pivotAxis: i
  };
  return (c) => new Un2(c, m);
}
var Bn2 = 5;
var Zn2 = class extends F3 {
  progress({ x: e, y: o }) {
    const { invert: n, angle: r, perspective: s } = this.options, i = h(0, 1, r, -r, o) * n, l = h(0, 1, -r, r, e) * n;
    this.target.style.transform = `perspective(${s}px) rotateX(${i}deg) rotateY(${l}deg) rotate(var(--motion-rotate, 0deg))`;
  }
  cancel() {
    this.target.style.transform = "", this.target.style.transition = "";
  }
};
function Si(t) {
  const { transitionDuration: e, transitionEasing: o } = t, n = t.namedEffect, r = n.inverted ?? false, s = _2(n.angle, [], Bn2, true), { perspective: i = 800 } = n, l = r ? -1 : 1, f = {
    transition: e ? `transform ${e}ms ${k2(o)}` : "",
    invert: l,
    angle: s,
    perspective: i
  };
  return (m) => new Zn2(m, f);
}
var Gn2 = { value: 200, unit: "px" };
var Vn2 = 5;
var Kn2 = "both";
var Hn2 = ["both", "horizontal", "vertical"];
var qn2 = class extends F3 {
  progress({ x: e, y: o }) {
    const { invert: n, distance: r, angle: s, axis: i, perspective: l } = this.options;
    let f = 0, m = 0, c = 0, d = 0;
    (i === "both" || i === "horizontal") && (f = h(0, 1, -r.value, r.value, e), d = h(0, 1, -s, s, e) * n), (i === "both" || i === "vertical") && (m = h(0, 1, -r.value, r.value, o), c = h(0, 1, s, -s, o) * n);
    const u = N2(r.unit);
    this.target.style.transform = `perspective(${l}px) translateX(${f}${u}) translateY(${m}${u}) rotateX(${c}deg) rotateY(${d}deg) rotate(var(--motion-rotate, 0deg))`;
  }
  cancel() {
    this.target.style.transform = "", this.target.style.transition = "";
  }
};
function Ti(t) {
  const { transitionDuration: e, transitionEasing: o } = t, n = t.namedEffect, r = n.inverted ?? false, s = A2(n.distance, Gn2), i = _2(n.angle, [], Vn2, true), l = _2(n.axis, Hn2, Kn2), { perspective: f = 800 } = n, m = r ? -1 : 1, c = {
    transition: e ? `transform ${e}ms ${k2(o)}` : "",
    invert: m,
    distance: s,
    axis: l,
    angle: i,
    perspective: f
  };
  return (d) => new qn2(d, c);
}
function P2(t, e, o) {
  e.measure((n) => {
    n && (t["--motion-comp-height"] = `${n.offsetHeight}px`, t["--motion-comp-half-height"] && (t["--motion-comp-half-height"] = `${Math.round(0.5 * n.offsetHeight)}px`));
  }), e.mutate((n) => {
    n?.style.setProperty("--motion-comp-height", t["--motion-comp-height"]), t["--motion-comp-half-height"] && n?.style.setProperty(
      "--motion-comp-half-height",
      t["--motion-comp-half-height"]
    );
  });
}
var Jn2 = () => window.document.getElementById("masterPage");
var Qn2 = () => {
  const t = window.document.getElementById("WIX_ADS");
  return t ? t.offsetHeight : 0;
};
var Wn2 = () => {
  const t = Jn2();
  return t ? t.offsetHeight + Qn2() : 0;
};
function tr(t, e, o) {
  e.measure(() => {
    t["--motion-site-height"] = `${Wn2()}px`;
  }), e.mutate((n) => {
    n?.style.setProperty("--motion-site-height", t["--motion-site-height"]);
  });
}
function ht(t, e) {
  return t > e ? 0 : 1 / (1 - t / e);
}
function Et2(t) {
  return ["motion-bgCloseUpOpacity", "motion-bgCloseUpZoom"];
}
function Ot3(t, e) {
  const o = {
    "--motion-comp-height": "0px",
    "--motion-comp-half-height": "0px"
  };
  return e && P2(o, e), o;
}
function er(t, e) {
  return t.measures = Ot3(t, e), xt2(t, true);
}
function xt2(t, e = false) {
  const o = "linear", { scale: n = 80 } = t.namedEffect, r = { "--motion-trans-z": `${n}px` }, [s, i] = Et2();
  return [
    {
      ...t,
      name: s,
      easing: o,
      part: "BG_LAYER",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get startOffsetAdd() {
        return `calc(50vh + ${a(
          t.measures || {},
          "--motion-comp-half-height",
          e
        )})`;
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100vh + ${a(
          t.measures || {},
          "--motion-comp-height",
          e
        )})`;
      },
      keyframes: [
        {
          opacity: 1
        },
        {
          opacity: 0
        }
      ]
    },
    {
      ...t,
      name: i,
      easing: o,
      part: "BG_MEDIA",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100vh + ${a(
          t.measures || {},
          "--motion-comp-height",
          e
        )})`;
      },
      keyframes: [
        {
          transform: "perspective(100px) translateZ(0px)"
        },
        {
          transform: `perspective(100px) translateZ(${a(
            r,
            "--motion-trans-z",
            e
          )})`
        }
      ]
    }
  ];
}
var bi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Et2, prepare: Ot3, style: xt2, web: er }, Symbol.toStringTag, { value: "Module" }));
function It3(t) {
  return ["motion-bgFade"];
}
function St2(t, e) {
  const o = {
    "--motion-comp-height": "0px",
    "--motion-comp-half-height": "0px"
  };
  return e && P2(o, e), o;
}
function or(t, e) {
  return t.measures = St2(t, e), Tt2(t, true);
}
function Tt2(t, e = false) {
  const { range: o = "in" } = t.namedEffect, n = o === "out", r = n ? "sineOut" : "sineIn", s = {
    "--motion-bg-fade-from": n ? 1 : 0,
    "--motion-bg-fade-to": n ? 0 : 1
  }, [i] = It3();
  return [
    {
      ...t,
      name: i,
      part: "BG_LAYER",
      easing: r,
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      startOffsetAdd: n ? "100vh" : "0px",
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return n ? `calc(100vh + ${a(
          t.measures || {},
          "--motion-comp-height",
          e
        )})` : `calc(50vh + ${a(
          t.measures || {},
          "--motion-comp-half-height",
          e
        )})`;
      },
      keyframes: [
        {
          opacity: a(s, "--motion-bg-fade-from", e)
        },
        {
          opacity: a(s, "--motion-bg-fade-to", e)
        }
      ]
    }
  ];
}
var Ai = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: It3, prepare: St2, style: Tt2, web: or }, Symbol.toStringTag, { value: "Module" }));
function bt2(t) {
  return ["motion-bgFadeBackOpacity", "motion-bgFadeBackScale"];
}
function At2(t, e) {
  const o = {
    "--motion-comp-height": "0px",
    "--motion-comp-half-height": "0px"
  };
  return e && P2(o, e), o;
}
function nr(t, e) {
  return t.measures = At2(t, e), wt2(t, true);
}
function wt2(t, e = false) {
  const o = "sineOut", { scale: n = 0.7 } = t.namedEffect, r = { "--motion-scale": n }, [s, i] = bt2();
  return [
    {
      ...t,
      name: s,
      easing: "linear",
      part: "BG_LAYER",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      startOffsetAdd: "100vh",
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100vh + ${a(
          t.measures || {},
          "--motion-comp-height",
          e
        )})`;
      },
      keyframes: [
        {
          opacity: 1
        },
        {
          opacity: 0
        }
      ]
    },
    {
      ...t,
      name: i,
      easing: o,
      part: "BG_LAYER",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      startOffsetAdd: "100vh",
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100vh + ${a(
          t.measures || {},
          "--motion-comp-half-height",
          e
        )})`;
      },
      keyframes: [
        {
          scale: 1
        },
        {
          scale: a(r, "--motion-scale", e)
        }
      ]
    }
  ];
}
var wi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: bt2, prepare: At2, style: wt2, web: nr }, Symbol.toStringTag, { value: "Module" }));
var J2 = 100;
function Nt2(t) {
  return ["motion-bgFake3DParallax", "motion-bgFake3DStretch", "motion-bgFake3DZoom"];
}
function Dt2(t, e) {
  const o = { "--motion-comp-height": "0px" };
  return e && P2(o, e), o;
}
function rr(t, e) {
  return t.measures = Dt2(t, e), kt2(t, true);
}
function kt2(t, e = false) {
  const { stretch: o = 1.3, zoom: n = 100 / 6 } = t.namedEffect, r = ht(n, J2), s = {
    "--motion-scale-y": o,
    "--motion-trans-z": `${D2(n)}px`,
    "--motion-trans-y-factor": D2(-0.1 * (2 - r))
  }, [i, l, f] = Nt2(), { measures: m = { "--motion-comp-height": "0px" } } = t;
  return [
    {
      ...t,
      name: i,
      part: "BG_IMG",
      easing: "sineOut",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100svh + ${a(m, "--motion-comp-height", e)})`;
      },
      get keyframes() {
        return [
          {
            transform: "translateY(10svh)"
          },
          {
            transform: `translateY(calc(${a(
              s,
              "--motion-trans-y-factor",
              e
            )} * ${a(
              m,
              "--motion-comp-height",
              false,
              m["--motion-comp-height"]
            )}))`
          }
        ];
      }
    },
    {
      ...t,
      name: l,
      part: "BG_IMG",
      easing: "linear",
      composite: "add",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100svh + ${a(m, "--motion-comp-height", e)})`;
      },
      keyframes: [
        {
          transform: `scaleY(${a(s, "--motion-scale-y", e)})`
        },
        {
          transform: "scaleY(1)"
        }
      ]
    },
    {
      ...t,
      name: f,
      part: "BG_IMG",
      easing: "sineIn",
      composite: "add",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100svh + ${a(m, "--motion-comp-height", e)})`;
      },
      keyframes: [
        {
          transform: `perspective(${J2}px) translateZ(0px)`
        },
        {
          transform: `perspective(${J2}px) translateZ(${a(
            s,
            "--motion-trans-z",
            e
          )})`
        }
      ]
    }
  ];
}
var Ni = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Nt2, prepare: Dt2, style: kt2, web: rr }, Symbol.toStringTag, { value: "Module" }));
function Ft2(t) {
  return ["motion-bgPan"];
}
function Pt2(t, e) {
  const o = { "--motion-comp-height": "0px" };
  return e && P2(o, e), o;
}
function ar(t, e) {
  return t.measures = Pt2(t, e), Rt2(t, true);
}
function Rt2(t, e = false) {
  const { direction: o = "left", speed: n = 0.2 } = t.namedEffect, r = 50 * n / (1 + n) | 0, s = {
    "--motion-trans-x": o === "left" ? `${r}%` : `${-r}%`
  }, [i] = Ft2();
  return [
    {
      ...t,
      name: i,
      part: "BG_MEDIA",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100vh + ${a(
          t.measures || {},
          "--motion-comp-height",
          e
        )})`;
      },
      keyframes: [
        {
          transform: `translateX(${a(s, "--motion-trans-x", e)})`
        },
        {
          transform: `translateX(calc(-1 * ${a(s, "--motion-trans-x", e)}))`
        }
      ]
    }
  ];
}
var Di = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Ft2, prepare: Pt2, style: Rt2, web: ar }, Symbol.toStringTag, { value: "Module" }));
function Mt2(t) {
  return ["motion-bgParallax"];
}
function Yt2(t, e) {
  const o = { "--motion-comp-height": "0px" };
  return e && P2(o, e), o;
}
function sr(t, e) {
  return t.measures = Yt2(t, e), jt2(t, true);
}
function jt2(t, e = false) {
  const { speed: o = 0.2 } = t.namedEffect, n = {
    "--motion-parallax-speed": o
  }, [r] = Mt2();
  return [
    {
      ...t,
      name: r,
      part: "BG_MEDIA",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100svh + ${a(
          t.measures || {},
          "--motion-comp-height",
          e
        )})`;
      },
      keyframes: [
        {
          transform: `translateY(calc(${a(
            n,
            "--motion-parallax-speed",
            e
          )} * 100svh))`
        },
        {
          transform: `translateY(calc((200lvh - 100%) * ${a(
            n,
            "--motion-parallax-speed",
            e
          )}))`
        }
      ]
    }
  ];
}
var ki = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Mt2, prepare: Yt2, style: jt2, web: sr }, Symbol.toStringTag, { value: "Module" }));
function Ct2(t) {
  return ["motion-bgPullBack"];
}
function zt2(t, e) {
  const o = { "--motion-comp-height": "0px" };
  return e && P2(o, e), o;
}
function ir(t, e) {
  return t.measures = zt2(t, e), Lt2(t, true);
}
function Lt2(t, e = false) {
  const o = "linear", { scale: n = 50 } = t.namedEffect, r = {
    "--motion-trans-z": `${n}px`,
    // TODO: (ameerf) - remove and use only scale once CSS round is widely available
    "--motion-trans-y": `-${n / 3 | 0}%`
  }, [s] = Ct2();
  return [
    {
      ...t,
      name: s,
      easing: o,
      part: "BG_MEDIA",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `${a(t.measures || {}, "--motion-comp-height", e)}`;
      },
      keyframes: [
        {
          transform: `perspective(100px) translate3d(0px, ${a(
            r,
            "--motion-trans-y",
            e
          )}, ${a(r, "--motion-trans-z", e)})`
        },
        {
          transform: "perspective(100px) translate3d(0px, 0px, 0px)"
        }
      ]
    }
  ];
}
var Fi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Ct2, prepare: zt2, style: Lt2, web: ir }, Symbol.toStringTag, { value: "Module" }));
function cr(t) {
  return [];
}
function Xt2(t, e) {
  const o = { "--motion-comp-height": "0px" };
  return e && P2(o, e), o;
}
function lr(t, e) {
  return Xt2(t, e), Ut2();
}
function Ut2(t) {
  return [];
}
var Pi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: cr, prepare: Xt2, style: Ut2, web: lr }, Symbol.toStringTag, { value: "Module" }));
function Bt2(t) {
  return ["motion-bgRotate"];
}
function fr(t) {
  return Zt2(t, true);
}
function Zt2(t, e = false) {
  const o = "sineOut", { angle: n = 22, direction: r = "counter-clockwise" } = t.namedEffect, s = {
    "--motion-rot-from": `${r === "counter-clockwise" ? n : -n}deg`
  }, [i] = Bt2();
  return [
    {
      ...t,
      name: i,
      easing: o,
      part: "BG_MEDIA",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffsetAdd: "100vh",
      keyframes: [
        {
          transform: `rotate(${a(s, "--motion-rot-from", e)})`
        },
        {
          transform: "rotate(0deg)"
        }
      ]
    }
  ];
}
var Ri = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Bt2, style: Zt2, web: fr }, Symbol.toStringTag, { value: "Module" }));
function Gt2(t) {
  return ["motion-bgSkew"];
}
function Vt2(t, e) {
  const o = { "--motion-comp-height": "0px" };
  return e && P2(o, e), o;
}
function mr(t, e) {
  return t.measures = Vt2(t, e), Kt2(t, true);
}
function Kt2(t, e = false) {
  const { angle: o = 20, direction: n = "counter-clockwise" } = t.namedEffect, r = {
    "--motion-skew": `${n === "counter-clockwise" ? o : -o}deg`
  }, [s] = Gt2();
  return [
    {
      ...t,
      name: s,
      part: "BG_MEDIA",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100vh + ${a(
          t.measures || {},
          "--motion-comp-height",
          e
        )})`;
      },
      keyframes: [
        {
          transform: `skewY(${a(r, "--motion-skew", e)})`
        },
        {
          transform: `skewY(calc(-1 * ${a(r, "--motion-skew", e)}))`
        }
      ]
    }
  ];
}
var Mi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Gt2, prepare: Vt2, style: Kt2, web: mr }, Symbol.toStringTag, { value: "Module" }));
var Z2 = 100;
var ur = 40;
var dr = 0.375;
var gr = {
  in: {
    easing: "sineIn",
    fromY: "20svh"
  },
  out: {
    easing: "sineInOut",
    fromY: "0px"
  }
};
function Ht2(t) {
  const { direction: e = "in" } = t.namedEffect, o = ["motion-bgZoomMedia", "motion-bgZoomImg"];
  return e === "in" && o.splice(1, 0, "motion-bgZoomParallax"), o;
}
function qt2(t, e) {
  const o = { "--motion-comp-height": "0px" };
  return e && P2(o, e), o;
}
function $r(t, e) {
  return t.measures = qt2(t, e), Jt2(t, true);
}
function Jt2(t, e = false) {
  let { direction: o = "in", zoom: n = ur } = t.namedEffect;
  const r = o === "in";
  r || (o = "out", n *= dr);
  const { easing: s, fromY: i } = gr[o], l = r ? 0 : n / 1.3, f = r ? n : -n, m = D2(ht(f, Z2)), c = {
    "--motion-zoom-over-pers": 0.5 * n / Z2,
    "--motion-scale-to": m,
    "--motion-trans-y-from": i,
    "--motion-trans-z-from": `${D2(l)}px`,
    "--motion-trans-z-to": `${D2(f)}px`
  }, { measures: d = { "--motion-comp-height": "0px" } } = t, u = [
    {
      ...t,
      part: "BG_MEDIA",
      easing: "linear",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      keyframes: [
        {
          transform: "translate3d(0, 0, 0)"
        },
        {
          transform: "translate3d(0, 0, 0)"
        }
      ]
    },
    {
      ...t,
      easing: s,
      part: "BG_IMG",
      composite: r ? "add" : "replace",
      startOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return `calc(100svh + ${a(d, "--motion-comp-height", e)})`;
      },
      keyframes: [
        {
          transform: `perspective(${Z2}px) translateZ(${a(
            c,
            "--motion-trans-z-from",
            e
          )})`
        },
        {
          transform: `perspective(${Z2}px) translateZ(${a(
            c,
            "--motion-trans-z-to",
            e
          )})`
        }
      ]
    }
  ];
  r && u.splice(1, 0, {
    ...t,
    part: "BG_IMG",
    easing: "linear",
    startOffset: {
      name: "cover",
      offset: { unit: "percentage", value: 0 }
    },
    endOffset: {
      name: "cover",
      offset: { unit: "percentage", value: 0 }
    },
    get endOffsetAdd() {
      return `calc(100svh + ${a(d, "--motion-comp-height", e)})`;
    },
    get keyframes() {
      return [
        {
          transform: `translateY(${a(c, "--motion-trans-y-from", e)})`
        },
        {
          transform: `translateY(calc(${a(
            c,
            "--motion-scale-to",
            e
          )} * (-0.2 * ${a(
            d,
            "--motion-comp-height",
            false,
            d["--motion-comp-height"]
          )} + ${a(
            c,
            "--motion-zoom-over-pers",
            e
          )} * max(0px, 100lvh - ${a(
            d,
            "--motion-comp-height",
            false,
            d["--motion-comp-height"]
          )}))))`
        }
      ];
    }
  });
  const g = Ht2(t);
  return u.forEach((p, $2) => {
    p.name = g[$2];
  }), u;
}
var Yi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Ht2, prepare: qt2, style: Jt2, web: $r }, Symbol.toStringTag, { value: "Module" }));
function Qt2(t) {
  return ["motion-imageParallax"];
}
function Wt2(t, e) {
  const o = {
    "--motion-comp-height": "0px",
    "--motion-site-height": "0"
  }, { isPage: n = false } = t.namedEffect;
  return e && (n ? tr(o, e) : P2(o, e)), o;
}
function pr(t, e) {
  return t.measures = Wt2(t, e), te2(t, true);
}
function te2(t, e = false) {
  const { speed: o = 1.5, reverse: n = false, isPage: r = false } = t.namedEffect;
  let s = -100 * (o - 1);
  r || (s = s / o);
  let i = 0;
  n && ([s, i] = [i, s]);
  const l = {
    "--motion-trans-y-from": `${s | 0}%`,
    "--motion-trans-y-to": `${i | 0}%`
  }, [f] = Qt2();
  return [
    {
      ...t,
      name: f,
      part: "BG_MEDIA",
      startOffset: {
        name: r ? "contain" : "cover",
        offset: { unit: "percentage", value: 0 }
      },
      endOffset: {
        name: "cover",
        offset: { unit: "percentage", value: 0 }
      },
      get endOffsetAdd() {
        return r ? `${a(t.measures || {}, "--motion-site-height", e)}` : `calc(100vh + ${a(
          t.measures || {},
          "--motion-comp-height",
          e
        )})`;
      },
      keyframes: [
        {
          transform: `translateY(${a(l, "--motion-trans-y-from", e)})`
        },
        {
          transform: `translateY(${a(l, "--motion-trans-y-to", e)})`
        }
      ]
    }
  ];
}
var ji = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Qt2, prepare: Wt2, style: te2, web: pr }, Symbol.toStringTag, { value: "Module" }));
var yr = 1;
var vr = 3;
var _r = [
  { keyframe: 0, translateY: 0 },
  { keyframe: 8.8, translateY: -55 },
  { keyframe: 17.6, translateY: -87 },
  { keyframe: 26.5, translateY: -98 },
  { keyframe: 35.3, translateY: -87 },
  { keyframe: 44.1, translateY: -55 },
  { keyframe: 53.1, translateY: 0 },
  { keyframe: 66.2, translateY: -23 },
  { keyframe: 81, translateY: 0 },
  { keyframe: 86.8, translateY: -5 },
  { keyframe: 94.1, translateY: 0 },
  { keyframe: 97.1, translateY: -2 },
  { keyframe: 100, translateY: 0 }
];
function hr(t, e) {
  return ee2(t, true);
}
function ee2(t, e = false) {
  const o = t.namedEffect, { intensity: n = 0 } = o, r = t.duration || 1, s = o?.iterationDelay || 0, i = I(r, s), [l] = oe2(t), f = h(0, 1, yr, vr, n), m = S("sineOut"), c = {
    "--motion-bounce-factor": f
  }, d = _r.map(({ keyframe: u, translateY: g }) => ({
    offset: u / 100 * i,
    translate: `0px calc(${g / 2}px * ${a(
      c,
      "--motion-bounce-factor",
      e
    )})`,
    easing: m
  }));
  return [
    {
      ...t,
      name: l,
      easing: "linear",
      duration: r + s,
      custom: c,
      keyframes: d
    }
  ];
}
function oe2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-bounce-${I(t.duration, e, true)}`];
}
var Ci = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: oe2, style: ee2, web: hr }, Symbol.toStringTag, { value: "Module" }));
var w = ["top", "right", "bottom", "left"];
var B2 = ["horizontal", "vertical"];
var H2 = ["clockwise", "counter-clockwise"];
var L2 = ["left", "right"];
var Er = [
  "top",
  "right",
  "bottom",
  "left",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
];
var ne2 = [
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
  "top-left",
  "center"
];
var Or = ["top-left", "top-right", "bottom-left", "bottom-right"];
var xr = { value: 25, unit: "px" };
var Ir = [...B2, "center"];
var Sr = "vertical";
var Tr = {
  vertical: { x: 0, y: 1, z: 0 },
  horizontal: { x: 1, y: 0, z: 0 },
  center: { x: 0, y: 0, z: 1 }
};
var br = [
  { translateFactor: 1, timeFactor: 0.1 },
  { translateFactor: -1, timeFactor: 0.302 },
  { translateFactor: 1, timeFactor: 0.504 },
  { translateFactor: -0.7, timeFactor: 0.705 },
  { translateFactor: 0.6, timeFactor: 0.839 }
];
function Ar(t, e) {
  return re2(t, true);
}
function re2(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, Ir, Sr), r = A2(o.distance, xr), { perspective: s = 800 } = o, i = t.easing || "sineInOut", l = t.duration || 1, f = o?.iterationDelay || 0, m = l + f, c = I(l, f), [d] = ae2(t), { x: u, y: g, z: p } = Tr[n], $2 = K2(i), y = {
    "--motion-breathe-perspective": n === "center" ? `perspective(${s}px)` : "",
    "--motion-breathe-distance": `${r.value}${N2(r.unit || "px")}`,
    "--motion-breathe-x": u,
    "--motion-breathe-y": g,
    "--motion-breathe-z": p
  }, O2 = `${a(y, "--motion-breathe-x", e)}`, x3 = `${a(y, "--motion-breathe-y", e)}`, T = `${a(y, "--motion-breathe-z", e)}`, E = `${a(
    y,
    "--motion-breathe-perspective",
    e,
    ""
  )}`, b2 = `${a(y, "--motion-breathe-distance", e)}`, X2 = f ? br.map(({ translateFactor: ot2, timeFactor: Wo }) => {
    const tn2 = Wo * c, q2 = `${b2} * ${ot2}`;
    return {
      offset: tn2,
      easing: S($2.inOut),
      transform: `${E} translate3d(calc(${O2} * ${q2}), calc(${x3} * ${q2}), calc(${T} * ${q2})) rotateZ(var(--motion-rotate, 0deg))`
    };
  }) : [
    {
      offset: 0.25,
      easing: S($2.inOut),
      transform: `${E} translate3d(calc(${O2} * ${b2}), calc(${x3} * ${b2}), calc(${T} * ${b2})) rotateZ(var(--motion-rotate, 0deg))`
    },
    {
      offset: 0.75,
      easing: S($2.in),
      transform: `${E} translate3d(calc(${O2} * -1 * ${b2}), calc(${x3} * -1 * ${b2}), calc(${T} * -1 * ${b2})) rotateZ(var(--motion-rotate, 0deg))`
    }
  ];
  return [
    {
      ...t,
      name: d,
      easing: "linear",
      duration: m,
      custom: y,
      keyframes: [
        {
          offset: 0,
          easing: S($2.out),
          transform: `${E} translate3d(0, 0, 0) rotateZ(var(--motion-rotate, 0deg))`
        },
        ...X2,
        {
          offset: 1,
          transform: `${E} translate3d(0, 0, 0) rotateZ(var(--motion-rotate, 0deg))`
        }
      ]
    }
  ];
}
function ae2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-breathe-${I(t.duration, e, true)}`];
}
var zi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: ae2, style: re2, web: Ar }, Symbol.toStringTag, { value: "Module" }));
var wr = "right";
var Nr = {
  // 100cqw - left
  RIGHT: "calc(var(--motion-parent-width, 100vw) - var(--motion-left, 0px))",
  // left * -1 - width
  LEFT: "calc(var(--motion-left, 0px) * -1 - var(--motion-width, 100%))",
  // top * -1 - height
  TOP: "calc(var(--motion-top, 0px) * -1 - var(--motion-height, 100%))",
  // 100cqh - top
  BOTTOM: "calc(var(--motion-parent-height, 100vh) - var(--motion-top, 0px))"
};
var { RIGHT: M2, LEFT: Y2, TOP: j2, BOTTOM: C2 } = Nr;
var at2 = {
  "top-left": {
    // min(100cqw - left, 100cqh - top)
    from: `min(${M2}, ${C2})`,
    // min(abs(left * -1 - width), abs(top * -1 - height))
    to: `min(calc(${Y2} * -1), calc(${j2} * -1))`
  },
  "top-right": {
    // min(abs(left * -1 - width), 100cqh - top)
    from: `min(calc(${Y2} * -1), ${C2})`,
    // min(100cqw - left, abs(top * -1 - height))
    to: `min(${M2}, calc(${j2} * -1))`
  },
  "bottom-left": {
    // min(100cqw - left, abs(top * -1 - height))
    from: `min(${M2}, calc(${j2} * -1))`,
    // min(abs(left * -1 - width), 100cqh - top)
    to: `min(calc(${Y2} * -1), ${C2})`
  },
  "bottom-right": {
    // min(abs(left * -1 - width), abs(top * -1 - height))
    from: `min(calc(${Y2} * -1), calc(${j2} * -1))`,
    // min(100cqw - left, 100cqh - top)
    to: `min(${M2}, ${C2})`
  }
};
var Q2 = {
  left: {
    from: `${M2} 0`,
    to: `${Y2} 0`
  },
  right: {
    from: `${Y2} 0`,
    to: `${M2} 0`
  },
  top: {
    from: `0 ${C2}`,
    to: `0 ${j2}`
  },
  bottom: {
    from: `0 ${j2}`,
    to: `0 ${C2}`
  }
};
var Dr = {
  // (width + left) / (100cqw + width)
  left: ({ left: t, width: e, parentWidth: o }) => (e + t) / (o + e || 1),
  // (100cqw - left) / (100cqw + width)
  right: ({ left: t, width: e, parentWidth: o }) => (o - t) / (o + e || 1),
  // (100cqh - top) / (100cqh + height)
  bottom: ({ top: t, height: e, parentHeight: o }) => (o - t) / (o + e || 1),
  // (height + top) / (100cqh + height)
  top: ({ top: t, height: e, parentHeight: o }) => (e + t) / (o + e || 1),
  // min(<left>, <top>)
  "bottom-right": ({
    left: t,
    top: e,
    width: o,
    height: n,
    parentWidth: r,
    parentHeight: s
  }) => {
    const i = o + t, l = s - e;
    return i < l ? i / (r + o || 1) : l / (s + n || 1);
  },
  // min(<right>, <top>)
  "bottom-left": ({
    left: t,
    top: e,
    width: o,
    height: n,
    parentWidth: r,
    parentHeight: s
  }) => {
    const i = r - t, l = s - e;
    return i < l ? i / (r + o || 1) : l / (s + n || 1);
  },
  // min(<left>, <bottom>)
  "top-right": ({
    left: t,
    top: e,
    width: o,
    height: n,
    parentWidth: r,
    parentHeight: s
  }) => {
    const i = r - t, l = n + e;
    return i < l ? i / (r + o || 1) : l / (s + n || 1);
  },
  // min(<right>, <bottom>)
  "top-left": ({
    left: t,
    top: e,
    width: o,
    height: n,
    parentWidth: r,
    parentHeight: s
  }) => {
    const i = r - t, l = n + e;
    return i < l ? i / (r + o || 1) : l / (s + n || 1);
  }
};
function kr(t) {
  const e = at2[t].from, o = at2[t].to, n = t.startsWith("top") ? 1 : -1, r = -n, s = t.endsWith("left") ? 1 : -1, i = -s;
  return {
    from: `calc(${e} * ${s}) calc(${e} * ${n})`,
    to: `calc(${o} * ${i}) calc(${o} * ${r})`
  };
}
function Fr(t, e) {
  const o = t.namedEffect, n = _2(o?.direction, Er, wr), r = t.duration || 1, s = o?.iterationDelay || 0, i = I(r, s), [l] = se2(), f = {
    "--motion-left": "0px",
    "--motion-top": "0px",
    "--motion-width": "100%",
    "--motion-height": "100%",
    "--motion-parent-width": "100vw",
    "--motion-parent-height": "100vh"
  };
  let m = 0, c = 0, d = 0, u = 0, g = 0, p = 0;
  return e && (e.measure(($2) => {
    if (!$2)
      return;
    const { width: v, height: y } = $2.getBoundingClientRect(), O2 = $2.offsetParent, x3 = O2?.getBoundingClientRect() || {}, T = cn2($2, O2);
    m = T.left, c = T.top, d = v, u = y, g = x3.width, p = x3.height;
  }), e.mutate(($2) => {
    $2?.style.setProperty("--motion-left", `${m}px`), $2?.style.setProperty("--motion-top", `${c}px`), $2?.style.setProperty("--motion-width", `${d}px`), $2?.style.setProperty("--motion-height", `${u}px`), $2?.style.setProperty("--motion-parent-width", `${g}px`), $2?.style.setProperty("--motion-parent-height", `${p}px`);
  })), [
    {
      ...t,
      name: l,
      easing: "linear",
      duration: r + s,
      custom: f,
      get keyframes() {
        const $2 = Dr[n]({
          left: m,
          top: c,
          width: d,
          height: u,
          parentWidth: g,
          parentHeight: p
        }) * i;
        let v, y;
        if (n in Q2)
          v = Q2[n].from, y = Q2[n].to;
        else {
          const O2 = kr(
            n
          );
          v = O2.from, y = O2.to;
        }
        return [
          {
            offset: 0,
            translate: "0 0"
          },
          {
            offset: $2,
            translate: y,
            easing: "step-start"
          },
          {
            offset: $2,
            translate: v
          },
          {
            offset: i,
            translate: "0 0"
          },
          {
            offset: 1,
            translate: "0 0"
          }
        ];
      }
    }
  ];
}
function se2(t) {
  return ["motion-cross"];
}
var Li = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: se2, web: Fr }, Symbol.toStringTag, { value: "Module" }));
function Pr(t, e) {
  return ie(t, true);
}
function ie(t, e = false) {
  const o = t.namedEffect, n = t.duration || 1, r = o?.iterationDelay || 0, s = S(t.easing || "cubicInOut"), i = I(n, r), [l] = ce2(t), f = [
    {
      offset: 0,
      opacity: 1,
      easing: s
    },
    {
      offset: 0.5 * i,
      opacity: 0,
      easing: s
    },
    {
      offset: i,
      opacity: 1
    },
    {
      offset: 1,
      opacity: 1
    }
  ];
  return [
    {
      ...t,
      name: l,
      easing: "linear",
      duration: n + r,
      keyframes: f
    }
  ];
}
function ce2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-flash-${I(t.duration, e, true)}`];
}
var Xi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: ce2, style: ie, web: Pr }, Symbol.toStringTag, { value: "Module" }));
var Rr = "horizontal";
var Mr = {
  vertical: { x: "1", y: "0" },
  horizontal: { x: "0", y: "1" }
};
function Yr(t, e) {
  return le2(t, true);
}
function le2(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, B2, Rr), { perspective: r = 800 } = o, s = t.duration || 1, i = o?.iterationDelay || 0, l = I(s, i), [f] = fe2(t), m = Mr[n], c = t.easing || "linear", d = {
    "--motion-perspective": `${r}px`,
    "--motion-rotate-x": m.x,
    "--motion-rotate-y": m.y
  }, u = `rotate3d(${a(
    d,
    "--motion-rotate-x",
    e
  )}, ${a(d, "--motion-rotate-y", e)}, 0, 0deg)`, g = `rotate3d(${a(
    d,
    "--motion-rotate-x",
    e
  )}, ${a(d, "--motion-rotate-y", e)}, 0, 360deg)`;
  return [
    {
      ...t,
      name: f,
      easing: "linear",
      duration: s + i,
      custom: d,
      keyframes: [
        {
          offset: 0,
          transform: `perspective(${a(d, "--motion-perspective", e)}) rotateZ(var(--motion-rotate, 0deg)) ${u}`,
          easing: S(c)
        },
        {
          offset: l,
          transform: `perspective(${a(d, "--motion-perspective", e)}) rotateZ(var(--motion-rotate, 0deg)) ${g}`
        },
        {
          offset: 1,
          transform: `perspective(${a(d, "--motion-perspective", e)}) rotateZ(var(--motion-rotate, 0deg)) ${g}`
        }
      ]
    }
  ];
}
function fe2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-flip-${I(t.duration, e, true)}`];
}
var Ui = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: fe2, style: le2, web: Yr }, Symbol.toStringTag, { value: "Module" }));
var jr = "top";
var Cr = {
  top: {
    rotation: { x: 1, y: 0 },
    origin: { x: 0, y: -50 }
  },
  right: {
    rotation: { x: 0, y: 1 },
    origin: { x: 50, y: 0 }
  },
  bottom: {
    rotation: { x: 1, y: 0 },
    origin: { x: 0, y: 50 }
  },
  left: {
    rotation: { x: 0, y: 1 },
    origin: { x: -50, y: 0 }
  }
};
var zr = 15;
var Lr = [
  { fold: 1, frameFactor: 0.1 },
  { fold: -0.7, frameFactor: 0.302 },
  { fold: 0.6, frameFactor: 0.504 },
  { fold: -0.3, frameFactor: 0.686 },
  { fold: 0.2, frameFactor: 0.847 },
  { fold: -0.05, frameFactor: 1.049 },
  { fold: 0, frameFactor: 1.189 }
];
function Xr(t, e) {
  return me2(t, true);
}
function me2(t, e = false) {
  const o = t.namedEffect, n = _2(
    o.direction,
    w,
    jr
  ), { angle: r = zr } = o, s = t.easing || "cubicInOut", i = t.duration || 1, l = +(o?.iterationDelay || 0), [f] = ue2(t), { rotation: m, origin: c } = Cr[n], { x: d, y: u } = c, g = K2(s), p = i + l, $2 = I(i, l), v = {
    "--motion-origin-x": `${d}%`,
    "--motion-origin-y": `${u}%`,
    "--motion-rotate-angle": `${r}deg`,
    "--motion-rotate-x": `${m.x}`,
    "--motion-rotate-y": `${m.y}`
  }, y = `rotateZ(var(--motion-rotate, 0deg)) translateX(${a(
    v,
    "--motion-origin-x",
    e
  )}) translateY(${a(v, "--motion-origin-y", e)}) perspective(800px)`, O2 = `translateX(calc(-1 * ${a(
    v,
    "--motion-origin-x",
    e
  )})) translateY(calc(-1 * ${a(v, "--motion-origin-y", e)}))`, x3 = (b2) => `${y} rotateX(calc(${a(
    v,
    "--motion-rotate-x",
    e
  )} * ${b2} * ${r}deg)) rotateY(calc(${a(
    v,
    "--motion-rotate-y",
    e
  )} * ${b2} * ${r}deg)) ${O2}`, T = l ? Lr.map(({ fold: b2, frameFactor: X2 }) => ({
    offset: X2 * $2,
    easing: S("sineInOut"),
    transform: x3(b2)
  })) : [
    {
      offset: 0.25,
      easing: S(g.inOut),
      transform: x3(1)
    },
    {
      offset: 0.75,
      easing: S(g.in),
      transform: x3(-1)
    }
  ], E = x3(0);
  return [
    {
      ...t,
      name: f,
      easing: "linear",
      duration: p,
      custom: v,
      keyframes: [
        {
          offset: 0,
          easing: S(g.out),
          transform: E
        },
        ...T,
        {
          offset: 1,
          transform: E
        }
      ]
    }
  ];
}
function ue2(t) {
  const e = t.duration || 1, o = +(t.namedEffect?.iterationDelay || 0);
  return o ? [`motion-fold-${I(e, o, true)}`] : ["motion-fold"];
}
var Bi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: ue2, style: me2, web: Xr }, Symbol.toStringTag, { value: "Module" }));
var Ur = 1;
var Br = 4;
var Zr = [
  { keyframe: 24, skewY: 7 },
  { keyframe: 38, skewY: -2 },
  { keyframe: 58, skewY: 4 },
  { keyframe: 80, skewY: -2 },
  { keyframe: 100, skewY: 0 }
];
function Gr(t, e) {
  return de2(t, true);
}
function de2(t, e = false) {
  const o = t.namedEffect, { intensity: n = 0.25 } = o, r = t.duration || 1, s = o?.iterationDelay || 0, [i] = ge2(t), l = I(r, s), m = {
    "--motion-skew-y": h(0, 1, Ur, Br, n)
  }, c = Zr.map(({ keyframe: d, skewY: u }) => ({
    offset: d / 100 * l,
    transform: `rotateZ(var(--motion-rotate, 0deg)) skewY(calc(${a(
      m,
      "--motion-skew-y",
      e
    )} * ${u}deg))`
  }));
  return [
    {
      ...t,
      name: i,
      easing: "linear",
      duration: r + s,
      custom: m,
      keyframes: c
    }
  ];
}
function ge2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-jello-${I(t.duration, e, true)}`];
}
var Zi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: ge2, style: de2, web: Gr }, Symbol.toStringTag, { value: "Module" }));
var Vr = "right";
var Kr = [
  { keyframe: 17, translate: 7 },
  { keyframe: 32, translate: 25 },
  { keyframe: 48, translate: 8 },
  { keyframe: 56, translate: 11 },
  { keyframe: 66, translate: 25 },
  { keyframe: 83, translate: 4 },
  { keyframe: 100, translate: 0 }
];
var Hr = 1;
var qr = 4;
var Jr = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 }
};
function Qr(t, e) {
  return $e2(t, true);
}
function $e2(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, w, Vr), { intensity: r = 0.5 } = o, s = t.duration || 1, i = +(o?.iterationDelay || 0), { x: l, y: f } = Jr[n], m = I(s, i), [c] = pe2(t), d = h(0, 1, Hr, qr, r), u = {
    "--motion-translate-x": l * d,
    "--motion-translate-y": f * d
  }, g = Kr.map(({ keyframe: p, translate: $2 }) => {
    const v = `calc(${a(
      u,
      "--motion-translate-x",
      e
    )} * ${$2}px) calc(${a(
      u,
      "--motion-translate-y",
      e
    )} * ${$2}px)`;
    return {
      offset: p / 100 * m,
      translate: v
    };
  });
  return [
    {
      ...t,
      name: c,
      easing: "linear",
      duration: s + i,
      custom: u,
      keyframes: g
    }
  ];
}
function pe2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-poke-${I(t.duration, e, true)}`];
}
var Gi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: pe2, style: $e2, web: Qr }, Symbol.toStringTag, { value: "Module" }));
var Wr = 0;
var ta = 0.1;
var st2 = [
  { keyframe: 45, scaleX: 1.03, scaleY: 0.93 },
  { keyframe: 56, scaleX: 0.9, scaleY: 1.03 },
  { keyframe: 66, scaleX: 1.02, scaleY: 0.96 },
  { keyframe: 78, scaleX: 0.98, scaleY: 1.02 },
  { keyframe: 89, scaleX: 1.005, scaleY: 0.9995 },
  { keyframe: 100, scaleX: 1, scaleY: 1 }
];
function ea(t, e) {
  return ye2(t, true);
}
function ye2(t, e = false) {
  const o = t.namedEffect, { intensity: n = 0.5 } = o, r = t.duration || 1, s = o?.iterationDelay || 0, i = I(r, s), [l] = ve2(t), f = h(0, 1, Wr, ta, n), m = {}, c = st2.map(({ keyframe: d, scaleX: u, scaleY: g }, p) => {
    const $2 = p === st2.length - 1, v = p % 2 === 0, y = f * ($2 ? 0 : v ? 1 : -0.5), O2 = D2(u + y, 4), x3 = D2(g - y, 4), T = `--motion-scale-x-${d}`, E = `--motion-scale-y-${d}`;
    return m[T] = O2, m[E] = x3, {
      offset: d / 100 * i,
      transform: `rotateZ(var(--motion-rotate, 0deg)) scale(${a(
        m,
        T,
        e
      )}, ${a(m, E, e)})`
    };
  });
  return [
    {
      ...t,
      name: l,
      easing: "linear",
      duration: r + s,
      custom: m,
      keyframes: c
    }
  ];
}
function ve2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-rubber-${I(t.duration, e, true)}`];
}
var Vi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: ve2, style: ye2, web: ea }, Symbol.toStringTag, { value: "Module" }));
var oa = 0;
var na = 0.12;
var ra = [
  { keyframe: 27, scale: 0.96 },
  { keyframe: 45, scale: 1 },
  { keyframe: 72, scale: 0.93 },
  { keyframe: 100, scale: 1 }
];
function aa(t, e) {
  return _e2(t, true);
}
function _e2(t, e = false) {
  const o = t.namedEffect, { intensity: n = 0 } = o, r = t.duration || 1, s = o?.iterationDelay || 0, i = I(r, s), [l] = he2(t), m = {
    "--motion-pulse-offset": h(0, 1, oa, na, n)
  }, c = ra.map(({ keyframe: d, scale: u }) => ({
    offset: d / 100 * i,
    transform: `scale(${u < 1 ? `calc(${u} - ${a(m, "--motion-pulse-offset", e)})` : "1"})`
  }));
  return i < 1 && c.push({
    offset: 1,
    transform: "scale(1)"
  }), [
    {
      ...t,
      name: l,
      easing: "linear",
      duration: r + s,
      custom: m,
      keyframes: c
    }
  ];
}
function he2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-pulse-${I(t.duration, e, true)}`];
}
var Ki = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: he2, style: _e2, web: aa }, Symbol.toStringTag, { value: "Module" }));
var sa = "clockwise";
var ia = {
  clockwise: -1,
  "counter-clockwise": 1
};
function ca(t, e) {
  return Ee2(t, true);
}
function Ee2(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, H2, sa), r = t.duration || 1, s = o?.iterationDelay || 0, i = I(r, s), [l] = Oe2(t), f = t.easing || "linear", c = {
    "--motion-rotate-start": `calc(var(--motion-rotate, 0deg) + ${(ia[n] > 0 ? 1 : -1) * 360}deg)`
  };
  return [
    {
      ...t,
      name: l,
      easing: "linear",
      duration: r + s,
      custom: c,
      keyframes: [
        {
          offset: 0,
          easing: S(f),
          rotate: a(c, "--motion-rotate-start", e)
        },
        {
          offset: i,
          rotate: "var(--motion-rotate, 0deg)"
        }
      ]
    }
  ];
}
function Oe2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-spin-${I(t.duration, e, true)}`];
}
var Hi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Oe2, style: Ee2, web: ca }, Symbol.toStringTag, { value: "Module" }));
var la = "top";
var fa = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};
var it2 = 50;
var ma = [
  { factor: 1, timeFactor: 0.0934 },
  { factor: -1, timeFactor: 0.28 },
  { factor: 0.6, timeFactor: 0.466 },
  { factor: -0.3, timeFactor: 0.653 },
  { factor: 0.2, timeFactor: 0.839 },
  { factor: -0.05, timeFactor: 1.026 },
  { factor: 0, timeFactor: 1.175 }
];
function ua(t, e) {
  return xe2(t, true);
}
function xe2(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, w, la), { swing: r = 20 } = o, s = t.duration || 1, i = o?.iterationDelay || 0, l = t.easing || "sineInOut", f = K2(l), [m] = Ie2(t), { x: c, y: d } = fa[n], u = s + i, g = I(s, i), p = {
    "--motion-swing-deg": `${r}deg`,
    "--motion-trans-x": `${c * it2}%`,
    "--motion-trans-y": `${d * it2}%`,
    "--motion-ease-in": S(f.in),
    "--motion-ease-inout": S(f.inOut),
    "--motion-ease-out": S(f.out)
  }, $2 = `translate(${a(
    p,
    "--motion-trans-x",
    e
  )}, ${a(p, "--motion-trans-y", e)})`, v = `translate(calc(${a(
    p,
    "--motion-trans-x",
    e
  )} * -1), calc(${a(p, "--motion-trans-y", e)} * -1))`, y = i ? ma.map(({ factor: O2, timeFactor: x3 }) => ({
    offset: x3 * g,
    easing: a(p, "--motion-ease-inout", e),
    transform: `rotate(var(--motion-rotate, 0deg)) ${$2} rotate(calc(${a(
      p,
      "--motion-swing-deg",
      e
    )} * ${O2})) ${v}`
  })) : [
    {
      offset: 0.25,
      easing: a(p, "--motion-ease-inout", e),
      transform: `rotate(var(--motion-rotate, 0deg)) ${$2} rotate(${a(
        p,
        "--motion-swing-deg",
        e
      )}) ${v}`
    },
    {
      offset: 0.75,
      easing: a(p, "--motion-ease-in", e),
      transform: `rotate(var(--motion-rotate, 0deg)) ${$2} rotate(calc(${a(
        p,
        "--motion-swing-deg",
        e
      )} * -1)) ${v}`
    }
  ];
  return [
    {
      ...t,
      name: m,
      easing: "linear",
      duration: u,
      custom: p,
      keyframes: [
        {
          offset: 0,
          easing: a(p, "--motion-ease-out", e),
          transform: `rotateZ(var(--motion-rotate, 0deg)) ${$2} rotate(0deg) ${v}`
        },
        ...y,
        {
          offset: 1,
          transform: `rotateZ(var(--motion-rotate, 0deg)) ${$2} rotate(0deg) ${v}`
        }
      ]
    }
  ];
}
function Ie2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-swing-${I(t.duration, e, true)}`];
}
var qi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Ie2, style: xe2, web: ua }, Symbol.toStringTag, { value: "Module" }));
var da = 1;
var ga = 4;
var $a = [
  { keyframe: 18, transY: -10, accRotate: 10 },
  { keyframe: 35, transY: 0, accRotate: -18 },
  { keyframe: 53, transY: 0, accRotate: 14 },
  { keyframe: 73, transY: 0, accRotate: -10 },
  { keyframe: 100, transY: 0, accRotate: 4 }
];
function pa(t, e) {
  return Se2(t, true);
}
function Se2(t, e = false) {
  const o = t.namedEffect, { intensity: n = 0.5 } = o, r = t.duration || 1, s = o?.iterationDelay || 0, i = I(r, s), [l] = Te2(t), f = h(0, 1, da, ga, n);
  let m = 0;
  const c = {
    "--motion-wiggle-factor": f
  }, d = $a.map(({ keyframe: u, transY: g, accRotate: p }) => {
    const $2 = u / 100 * i, v = `calc(var(--motion-rotate, 0deg) + ${D2(
      m + p * f
    )}deg)`, y = `${g * f}px`, O2 = `--motion-rotate-${u}`, x3 = `--motion-translate-y-${u}`;
    return c[O2] = v, c[x3] = y, m += p * f, {
      offset: $2,
      transform: `rotate(${a(
        c,
        O2,
        e
      )}) translateY(${a(c, x3, e)})`
    };
  });
  return [
    {
      ...t,
      name: l,
      easing: "linear",
      duration: r + s,
      custom: c,
      keyframes: d
    }
  ];
}
function Te2(t) {
  const e = t.namedEffect?.iterationDelay || 0;
  return [`motion-wiggle-${I(t.duration, e, true)}`];
}
var Ji = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Te2, style: Se2, web: pa }, Symbol.toStringTag, { value: "Module" }));
var ct2 = 68;
var ya = "horizontal";
var va = {
  vertical: "rotateX",
  horizontal: "rotateY"
};
function be2(t) {
  return ["motion-arcScroll"];
}
function _a(t, e) {
  return Ae2(t, true);
}
function Ae2(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, B2, ya), { range: r = "in", perspective: s = 500 } = o, i = r === "out" ? "forwards" : r === "in" ? "backwards" : t.fill, l = va[n], f = r === "out" ? 0 : -ct2, m = r === "in" ? 0 : ct2, c = "linear", [d] = be2(), u = {
    "--motion-perspective": `${s}px`,
    "--motion-arc-from": `${l}(${f}deg)`,
    "--motion-arc-to": `${l}(${m}deg)`
  };
  return [
    {
      ...t,
      name: d,
      fill: i,
      easing: c,
      custom: u,
      keyframes: [
        {
          transform: `perspective(${a(u, "--motion-perspective", e)}) translateZ(-300px) ${a(
            u,
            "--motion-arc-from",
            e
          )} translateZ(300px) rotate(${a({}, "--motion-rotate", false, "0deg")})`
        },
        {
          transform: `perspective(${a(u, "--motion-perspective", e)}) translateZ(-300px) ${a(
            u,
            "--motion-arc-to",
            e
          )} translateZ(300px) rotate(${a({}, "--motion-rotate", false, "0deg")})`
        }
      ]
    }
  ];
}
var Qi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: be2, style: Ae2, web: _a }, Symbol.toStringTag, { value: "Module" }));
function we2(t) {
  return ["motion-blurScroll"];
}
function ha(t, e) {
  return Ne2(t, true);
}
function Ne2(t, e = false) {
  const { blur: o = 6, range: n = "in" } = t.namedEffect, r = n === "out" ? 0 : o, s = n === "out" ? o : 0, i = "linear", l = n === "out" ? "forwards" : n === "in" ? "backwards" : t.fill, [f] = we2(), m = {
    "--motion-blur-from": `${r}px`,
    "--motion-blur-to": `${s}px`
  };
  return [
    {
      ...t,
      name: f,
      fill: l,
      easing: i,
      composite: "add",
      custom: m,
      keyframes: [
        {
          filter: `blur(${a(m, "--motion-blur-from", e)})`
        },
        {
          filter: `blur(${a(m, "--motion-blur-to", e)})`
        }
      ]
    }
  ];
}
var Wi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: we2, style: Ne2, web: ha }, Symbol.toStringTag, { value: "Module" }));
function De2(t) {
  return ["motion-fadeScroll"];
}
function Ea(t, e) {
  return ke2(t, true);
}
function ke2(t, e = false) {
  const { opacity: o = 0, range: n = "in" } = t.namedEffect, r = n === "out", s = r ? a({}, "--comp-opacity", false, "1") : o, i = r ? o : a({}, "--comp-opacity", false, "1"), l = "linear", f = n === "out" ? "forwards" : n === "in" ? "backwards" : t.fill, [m] = De2(), c = {
    "--motion-fade-from": s,
    "--motion-fade-to": i
  };
  return [
    {
      ...t,
      name: m,
      fill: f,
      easing: l,
      custom: c,
      keyframes: [
        {
          opacity: a(c, "--motion-fade-from", e)
        },
        {
          opacity: a(c, "--motion-fade-to", e)
        }
      ]
    }
  ];
}
var tc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: De2, style: ke2, web: Ea }, Symbol.toStringTag, { value: "Module" }));
var Oa = "horizontal";
var xa = {
  vertical: "rotateX",
  horizontal: "rotateY"
};
function Fe2(t) {
  return ["motion-flipScroll"];
}
function Ia(t, e) {
  return Pe2(t, true);
}
function Pe2(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, B2, Oa), { rotate: r = 240, range: s = "continuous", perspective: i = 800 } = o, l = xa[n], f = s === "out" ? 0 : -r, m = s === "in" ? 0 : r, c = "linear", d = s === "out" ? "forwards" : s === "in" ? "backwards" : t.fill, [u] = Fe2(), g = {
    "--motion-perspective": `${i}px`,
    "--motion-flip-from": `${l}(${f}deg)`,
    "--motion-flip-to": `${l}(${m}deg)`
  };
  return [
    {
      ...t,
      name: u,
      fill: d,
      easing: c,
      custom: g,
      keyframes: [
        {
          transform: `perspective(${a(g, "--motion-perspective", e)}) ${a(
            g,
            "--motion-flip-from",
            e
          )} rotate(${a({}, "--motion-rotate", false, "0deg")})`
        },
        {
          transform: `perspective(${a(g, "--motion-perspective", e)}) ${a(
            g,
            "--motion-flip-to",
            e
          )} rotate(${a({}, "--motion-rotate", false, "0deg")})`
        }
      ]
    }
  ];
}
var ec = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Fe2, style: Pe2, web: Ia }, Symbol.toStringTag, { value: "Module" }));
var Sa = 40;
var Ta = "center";
var ba = {
  top: [0, -50],
  "top-right": [50, -50],
  right: [50, 0],
  "bottom-right": [50, 50],
  bottom: [0, 50],
  "bottom-left": [-50, 50],
  left: [-50, 0],
  "top-left": [-50, -50],
  center: [0, 0]
};
function Re2(t) {
  return ["motion-growScroll"];
}
function Aa(t, e) {
  return Me2(t, true);
}
function Me2(t, e = false) {
  const o = t.namedEffect, { range: n = "in", scale: r = n === "in" ? 0 : 4, speed: s = 0 } = o, i = _2(o?.direction, ne2, Ta), l = "linear", f = n === "out" ? "forwards" : n === "in" ? "backwards" : t.fill, m = r, c = r, u = s * Sa, g = {
    scale: n === "out" ? 1 : m,
    travel: n === "out" ? 0 : -u
  }, p = {
    scale: n === "in" ? 1 : c,
    travel: n === "in" ? 0 : u
  }, $2 = Math.abs(u), v = n === "out" ? "0px" : `${-$2}vh`, y = n === "in" ? "0px" : `${$2}vh`, [O2, x3] = ba[i] || [0, 0], [T] = Re2(), E = {
    "--motion-travel-from": `${g.travel}vh`,
    "--motion-travel-to": `${p.travel}vh`,
    "--motion-grow-from": g.scale,
    "--motion-grow-to": p.scale,
    "--motion-trans-x": `${O2}%`,
    "--motion-trans-y": `${x3}%`
  };
  return [
    {
      ...t,
      name: T,
      fill: f,
      easing: l,
      startOffsetAdd: v,
      endOffsetAdd: y,
      custom: E,
      keyframes: [
        {
          transform: `translateY(${a(
            E,
            "--motion-travel-from",
            e
          )}) translate(${a(E, "--motion-trans-x", e)}, ${a(
            E,
            "--motion-trans-y",
            e
          )}) scale(${a(
            E,
            "--motion-grow-from",
            e
          )}) translate(calc(-1 * ${a(
            E,
            "--motion-trans-x",
            e
          )}), calc(-1 * ${a(
            E,
            "--motion-trans-y",
            e
          )})) rotate(${a({}, "--motion-rotate", false, "0")})`
        },
        {
          transform: `translateY(${a(
            E,
            "--motion-travel-to",
            e
          )}) translate(${a(E, "--motion-trans-x", e)}, ${a(
            E,
            "--motion-trans-y",
            e
          )}) scale(${a(
            E,
            "--motion-grow-to",
            e
          )}) translate(calc(-1 * ${a(
            E,
            "--motion-trans-x",
            e
          )}), calc(-1 * ${a(
            E,
            "--motion-trans-y",
            e
          )})) rotate(${a({}, "--motion-rotate", false, "0")})`
        }
      ]
    }
  ];
}
var oc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Re2, style: Me2, web: Aa }, Symbol.toStringTag, { value: "Module" }));
var wa = 120;
var Na = { value: 400, unit: "px" };
function Ye2(t) {
  return ["motion-moveScroll"];
}
function Da(t, e, o) {
  return je2(t, o, true);
}
function je2(t, e, o = false) {
  const n = t.namedEffect, r = _2(n?.angle, [], wa, true), { range: s = "in" } = n, i = "linear", l = s === "out" ? "forwards" : s === "in" ? "backwards" : t.fill, f = A2(n.distance, Na);
  let [m, c] = an2(r, f.value);
  const d = N2(f.unit);
  let u = "", g = "";
  e?.ignoreScrollMoveOffsets || (c < 0 && s !== "out" && (u = `${c}${d}`, s !== "in" && (g = `${Math.abs(c)}${d}`)), c > 0 && s === "out" && (g = `${Math.abs(c)}${d}`)), [m, c] = [m, c].map(Math.round);
  const p = {
    x: s === "out" ? 0 : m,
    y: s === "out" ? 0 : c
  }, $2 = {
    x: s === "in" ? 0 : s === "out" ? m : -m,
    y: s === "in" ? 0 : s === "out" ? c : -c
  }, [v] = Ye2(), y = {
    "--motion-move-from-x": `${p.x}${d}`,
    "--motion-move-from-y": `${p.y}${d}`,
    "--motion-move-to-x": `${$2.x}${d}`,
    "--motion-move-to-y": `${$2.y}${d}`
  };
  return [
    {
      ...t,
      name: v,
      fill: l,
      easing: i,
      startOffsetAdd: u,
      endOffsetAdd: g,
      custom: y,
      keyframes: [
        {
          transform: `translate(${a(
            y,
            "--motion-move-from-x",
            o
          )}, ${a(
            y,
            "--motion-move-from-y",
            o
          )}) rotate(${a({}, "--motion-rotate", false, "0")})`
        },
        {
          transform: `translate(${a(
            y,
            "--motion-move-to-x",
            o
          )}, ${a(
            y,
            "--motion-move-to-y",
            o
          )}) rotate(${a({}, "--motion-rotate", false, "0")})`
        }
      ]
    }
  ];
}
var nc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Ye2, style: je2, web: Da }, Symbol.toStringTag, { value: "Module" }));
var ka = "left";
var Fa = { value: 400, unit: "px" };
function Ce2(t) {
  return ["motion-panScroll"];
}
function ze2(t, e) {
  if (t.namedEffect && t.namedEffect.startFromOffScreen && e) {
    let o = 0;
    e.measure((n) => {
      n && (o = n.getBoundingClientRect().left);
    }), e.mutate((n) => {
      n?.style.setProperty("--motion-left", `${o}px`);
    });
  }
}
function Pa(t, e) {
  return ze2(t, e), Le2(t, true);
}
function Le2(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, L2, ka), { startFromOffScreen: r = true, range: s = "in" } = o, i = A2(o.distance, Fa), l = i.value * (n === "left" ? 1 : -1);
  let f = `${-l}${N2(i.unit)}`, m = `${l}${N2(i.unit)}`;
  if (r) {
    const v = `calc(${a(
      {},
      "--motion-left",
      false,
      "calc(100vw - 100%)"
    )} * -1 - 100%)`, y = `calc(100vw - ${a({}, "--motion-left", false, "0px")})`;
    [f, m] = n === "left" ? [v, y] : [y, v];
  }
  const c = s === "out" ? 0 : f, d = s === "in" ? 0 : s === "out" ? f : m, u = "linear", g = s === "out" ? "forwards" : s === "in" ? "backwards" : t.fill, [p] = Ce2(), $2 = {
    "--motion-pan-from": c,
    "--motion-pan-to": d
  };
  return [
    {
      ...t,
      name: p,
      fill: g,
      easing: u,
      custom: $2,
      keyframes: [
        {
          transform: `translateX(${a(
            $2,
            "--motion-pan-from",
            e
          )}) rotate(${a({}, "--motion-rotate", false, "0")})`
        },
        {
          transform: `translateX(${a(
            $2,
            "--motion-pan-to",
            e
          )}) rotate(${a({}, "--motion-rotate", false, "0")})`
        }
      ]
    }
  ];
}
var rc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Ce2, prepare: ze2, style: Le2, web: Pa }, Symbol.toStringTag, { value: "Module" }));
var Ra = 0.5;
function Xe2(t) {
  return ["motion-parallaxScroll"];
}
function Ma(t, e) {
  return Ue2(t, true);
}
function Ue2(t, e = false) {
  const o = t.namedEffect, { parallaxFactor: n = Ra } = o, r = "linear", s = `${-50 * n}vh`, i = `${50 * n}vh`, [l] = Xe2(), f = {
    "--motion-parallax-to": i
  };
  return [
    {
      ...t,
      name: l,
      fill: "both",
      easing: r,
      startOffsetAdd: s,
      endOffsetAdd: i,
      custom: f,
      keyframes: [
        {
          transform: `translateY(calc(-1 * ${a(
            f,
            "--motion-parallax-to",
            e
          )})) rotate(${a({}, "--motion-rotate", false, "0")})`
        },
        {
          transform: `translateY(${a(
            f,
            "--motion-parallax-to",
            e
          )}) rotate(${a({}, "--motion-rotate", false, "0")})`
        }
      ]
    }
  ];
}
var ac = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Xe2, style: Ue2, web: Ma }, Symbol.toStringTag, { value: "Module" }));
var Ya = "bottom";
function Be2(t) {
  const { range: e = "in" } = t.namedEffect;
  return [`motion-revealScroll${e === "continuous" ? "-continuous" : ""}`];
}
function ja(t, e) {
  return Ze2(t);
}
function Ze2(t) {
  const e = t.namedEffect, o = _2(e?.direction, w, Ya), { range: n = "in" } = e, r = "linear", s = n === "out" ? "forwards" : n === "in" ? "backwards" : t.fill, [i] = Be2(t), l = {
    "--motion-clip-from": vt2(o, n),
    "--motion-clip-to": _t2(o, n)
  }, f = [
    {
      clipPath: a({}, "--motion-clip-from", false, l["--motion-clip-from"])
    },
    {
      clipPath: a({}, "--motion-clip-to", false, l["--motion-clip-to"])
    }
  ];
  return n === "continuous" && f.splice(1, 0, { clipPath: G }), [
    {
      ...t,
      name: i,
      fill: s,
      easing: r,
      custom: l,
      keyframes: f
    }
  ];
}
var sc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Be2, style: Ze2, web: ja }, Symbol.toStringTag, { value: "Module" }));
var lt = {
  diamond: (t) => {
    const e = t / 2, o = 100 - e;
    return [
      `polygon(50% ${e}%, ${o}% 50%, 50% ${o}%, ${e}% 50%)`,
      "polygon(50% -50%, 150% 50%, 50% 150%, -50% 50%)"
    ];
  },
  window: (t) => [
    `inset(${t / 2}% round 50% 50% 0% 0%)`,
    "inset(-20% round 50% 50% 0% 0%)"
  ],
  rectangle: (t) => [`inset(${t}%)`, "inset(0%)"],
  circle: (t) => [`circle(${100 - t}%)`, "circle(75%)"],
  ellipse: (t) => {
    const e = 50 - t / 2;
    return [`ellipse(${e}% ${e}%)`, "ellipse(75% 75%)"];
  }
};
function Ge2(t) {
  const { range: e = "in" } = t.namedEffect;
  return [`motion-shapeScroll${e === "continuous" ? "-continuous" : ""}`];
}
function Ca(t, e) {
  return Ve2(t, true);
}
function Ve2(t, e = false) {
  const { intensity: o = 0.5, range: n = "in" } = t.namedEffect;
  let { shape: r = "circle" } = t.namedEffect;
  r in lt || (r = "circle");
  const s = n === "out" ? "forwards" : n === "in" ? "backwards" : t.fill, [i, l] = lt[r](o * 100), [f] = Ge2(t), m = {
    "--motion-clip-from": n === "out" ? l : i,
    "--motion-clip-to": n === "out" ? i : l
  }, c = S("circInOut"), d = [
    {
      clipPath: a(m, "--motion-clip-from", e),
      easing: c
    },
    { clipPath: a(m, "--motion-clip-to", e) }
  ];
  return n === "continuous" && (d[1].easing = c, d.push({
    clipPath: a(m, "--motion-clip-from", e)
  })), [
    {
      ...t,
      name: f,
      fill: s,
      easing: "linear",
      custom: m,
      keyframes: d
    }
  ];
}
var ic = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Ge2, style: Ve2, web: Ca }, Symbol.toStringTag, { value: "Module" }));
var za = "right";
function Ke2(t) {
  const { range: e = "in" } = t.namedEffect;
  return [`motion-shuttersScroll-${e === "continuous" ? "-continuous" : ""}`];
}
function La(t, e) {
  return He(t, true);
}
function He(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, z3, za), { shutters: r = 12, staggered: s = true, range: i = "in" } = o, l = i === "out" ? "forwards" : i === "in" ? "backwards" : t.fill, f = S(i === "in" ? "sineIn" : "sineOut"), m = V2(z3, n), { clipStart: c, clipEnd: d } = tt2(
    i === "out" ? m : n,
    r,
    s
  ), u = {
    "--motion-shutters-clip-start": i === "out" ? d : c,
    "--motion-shutters-clip-end": i === "out" ? c : d
  }, [g] = Ke2(t), p = [
    {
      clipPath: a(u, "--motion-shutters-clip-start", e),
      easing: f
    },
    {
      clipPath: a(u, "--motion-shutters-clip-end", e)
    }
  ];
  if (i === "continuous") {
    p[1].easing = f, p[1].offset = s ? 0.45 : 0.4;
    const { clipStart: $2, clipEnd: v } = tt2(
      m,
      r,
      s,
      true
    );
    Object.assign(u, {
      "--motion-shutters-clip-opp-end": v,
      "--motion-shutters-clip-opp-start": $2
    });
    const y = s ? 0.55 : 0.6;
    p.push(
      {
        clipPath: a(u, "--motion-shutters-clip-end", e),
        offset: y,
        easing: f
      },
      {
        clipPath: a(u, "--motion-shutters-clip-opp-end", e),
        offset: y,
        easing: f
      },
      {
        clipPath: a(u, "--motion-shutters-clip-opp-start", e)
      }
    );
  }
  return [
    {
      ...t,
      name: g,
      fill: l,
      easing: "linear",
      custom: u,
      keyframes: p
    }
  ];
}
var cc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Ke2, style: He, web: La }, Symbol.toStringTag, { value: "Module" }));
var Xa = 40;
var Ua = "center";
var Ba = {
  top: [0, -50],
  "top-right": [50, -50],
  right: [50, 0],
  "bottom-right": [50, 50],
  bottom: [0, 50],
  "bottom-left": [-50, 50],
  left: [-50, 0],
  "top-left": [-50, -50],
  center: [0, 0]
};
function qe2(t) {
  return ["motion-shrinkScroll"];
}
function Za(t, e) {
  return Je2(t, true);
}
function Je2(t, e = false) {
  const o = t.namedEffect, { range: n = "in", scale: r = n === "in" ? 1.2 : 0.8, speed: s = 0 } = o, i = _2(o?.direction, ne2, Ua), l = "linear", f = n === "out" ? "forwards" : n === "in" ? "backwards" : t.fill, m = r, c = r, u = s * Xa, g = {
    scale: n === "out" ? 1 : m,
    travel: n === "out" ? 0 : -u
  }, p = {
    scale: n === "in" ? 1 : c,
    travel: n === "in" ? 0 : u
  }, $2 = Math.abs(u), v = n === "out" ? "0px" : `${-$2}vh`, y = n === "in" ? "0px" : `${$2}vh`, [O2, x3] = Ba[i] || [0, 0], [T] = qe2(), E = {
    "--motion-travel-from": `${g.travel}vh`,
    "--motion-travel-to": `${p.travel}vh`,
    "--motion-shrink-from": g.scale,
    "--motion-shrink-to": p.scale,
    "--motion-trans-x": `${O2}%`,
    "--motion-trans-y": `${x3}%`
  };
  return [
    {
      ...t,
      name: T,
      fill: f,
      easing: l,
      custom: E,
      startOffsetAdd: v,
      endOffsetAdd: y,
      keyframes: [
        {
          transform: `translateY(${a(
            E,
            "--motion-travel-from",
            e
          )}) translate(${a(E, "--motion-trans-x", e)}, ${a(
            E,
            "--motion-trans-y",
            e
          )}) scale(${a(
            E,
            "--motion-shrink-from",
            e
          )}) translate(calc(-1 * ${a(
            E,
            "--motion-trans-x",
            e
          )}), calc(-1 * ${a(
            E,
            "--motion-trans-y",
            e
          )})) rotate(${a({}, "--motion-rotate", false, "0")})`
        },
        {
          transform: `translateY(${a(
            E,
            "--motion-travel-to",
            e
          )}) translate(${a(E, "--motion-trans-x", e)}, ${a(
            E,
            "--motion-trans-y",
            e
          )}) scale(${a(
            E,
            "--motion-shrink-to",
            e
          )}) translate(calc(-1 * ${a(
            E,
            "--motion-trans-x",
            e
          )}), calc(-1 * ${a(
            E,
            "--motion-trans-y",
            e
          )})) rotate(${a({}, "--motion-rotate", false, "0")})`
        }
      ]
    }
  ];
}
var lc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: qe2, style: Je2, web: Za }, Symbol.toStringTag, { value: "Module" }));
var Ga = "right";
var Va = {
  right: -1,
  left: 1
};
function Qe2(t) {
  return ["motion-skewPanScroll"];
}
function We2(t, e) {
  if (e) {
    let o = 0;
    e.measure((n) => {
      n && (o = n.getBoundingClientRect().left);
    }), e.mutate((n) => {
      n?.style.setProperty("--motion-left", `${o}px`);
    });
  }
}
function Ka(t, e) {
  return We2(t, e), to(t, true);
}
function to(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, L2, Ga), { skew: r = 10, range: s = "in" } = o, i = "linear", l = s === "out" ? "forwards" : s === "in" ? "backwards" : t.fill, f = r * Va[n], m = `calc(${a(
    {},
    "--motion-left",
    false,
    "calc(100vw - 100%)"
  )} * -1 - 100%)`, c = `calc(100vw - ${a({}, "--motion-left", false, "0px")})`, [d, u] = n === "left" ? [m, c] : [c, m], g = {
    skew: s === "out" ? 0 : f,
    translate: s === "out" ? 0 : d
  }, p = {
    skew: s === "in" ? 0 : -f,
    translate: s === "in" ? 0 : s === "out" ? d : u
  }, [$2] = Qe2(), v = {
    "--motion-skewpan-start-x": g.translate,
    "--motion-skewpan-end-x": p.translate,
    "--motion-skewpan-from-skew": `${g.skew}deg`,
    "--motion-skewpan-to-skew": `${p.skew}deg`
  };
  return [
    {
      ...t,
      name: $2,
      fill: l,
      easing: i,
      custom: v,
      keyframes: [
        {
          transform: `translateX(${a(
            v,
            "--motion-skewpan-start-x",
            e
          )}) skewX(${a(
            v,
            "--motion-skewpan-from-skew",
            e
          )}) rotate(${a({}, "--motion-rotate", false, "0")})`
        },
        {
          transform: `translateX(${a(
            v,
            "--motion-skewpan-end-x",
            e
          )}) skewX(${a(
            v,
            "--motion-skewpan-to-skew",
            e
          )}) rotate(${a({}, "--motion-rotate", false, "0")})`
        }
      ]
    }
  ];
}
var fc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Qe2, prepare: We2, style: to, web: Ka }, Symbol.toStringTag, { value: "Module" }));
var Ha = "bottom";
var ft2 = {
  bottom: { x: "0", y: "100%" },
  left: { x: "-100%", y: "0" },
  top: { x: "0", y: "-100%" },
  right: { x: "100%", y: "0" }
};
function eo(t) {
  const { range: e = "in" } = t.namedEffect;
  return [`motion-slideScroll${e === "continuous" ? "-continuous" : ""}`];
}
function qa(t, e) {
  return oo(t, true);
}
function oo(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, z3, Ha), { range: r = "in" } = o, s = "linear", i = r === "out" ? "forwards" : r === "in" ? "backwards" : t.fill, l = V2(z3, n), f = r === "out" ? { x: "0", y: "0" } : ft2[n], m = r === "in" ? { x: "0", y: "0" } : ft2[r === "out" ? n : l], c = {
    "--motion-clip-from": vt2(n, r),
    "--motion-clip-to": _t2(n, r),
    "--motion-translate-from-x": f.x,
    "--motion-translate-from-y": f.y,
    "--motion-translate-to-x": m.x,
    "--motion-translate-to-y": m.y
  }, d = [
    {
      clipPath: a({}, "--motion-clip-from", false, c["--motion-clip-from"]),
      transform: `rotate(${a(
        {},
        "--motion-rotate",
        false,
        "0"
      )}) translate(${a(
        c,
        "--motion-translate-from-x",
        e
      )}, ${a(c, "--motion-translate-from-y", e)})`
    },
    {
      clipPath: a({}, "--motion-clip-to", false, c["--motion-clip-to"]),
      transform: `rotate(${a(
        {},
        "--motion-rotate",
        false,
        "0"
      )}) translate(${a(
        c,
        "--motion-translate-to-x",
        e
      )}, ${a(c, "--motion-translate-to-y", e)})`
    }
  ];
  r === "continuous" && d.splice(1, 0, {
    clipPath: G,
    transform: `rotate(${a({}, "--motion-rotate", false, "0")}) translate(0, 0)`
  });
  const [u] = eo(t);
  return [
    {
      ...t,
      name: u,
      fill: i,
      easing: s,
      custom: c,
      keyframes: d
    }
  ];
}
var mc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: eo, style: oo, web: qa }, Symbol.toStringTag, { value: "Module" }));
var Ja = 40;
function no(t) {
  return ["motion-spin3dScroll"];
}
function Qa(t, e) {
  return ro(t, true);
}
function ro(t, e = false) {
  const {
    rotate: o = -100,
    speed: n = 0,
    range: r = "in",
    perspective: s = 1e3
  } = t.namedEffect, i = "linear", l = r === "out" ? "forwards" : r === "in" ? "backwards" : t.fill, f = n * Ja, m = {
    rotationX: r === "out" ? 0 : -2 * o,
    rotationY: r === "out" ? 0 : -o,
    rotationZ: r === "out" ? 0 : -o,
    travel: r === "out" ? 0 : -f
  }, c = {
    rotationX: o * (r === "in" ? 0 : r === "out" ? 3 : 1.8),
    rotationY: o * (r === "in" ? 0 : r === "out" ? 2 : 1),
    rotationZ: o * (r === "in" ? 0 : r === "out" ? 1 : 2),
    travel: r === "in" ? 0 : f
  }, d = Math.abs(f), u = r === "out" ? "0px" : `${-d}vh`, g = r === "in" ? "0px" : `${d}vh`, [p] = no(), $2 = {
    "--motion-perspective": `${s}px`,
    "--motion-travel-from": `${m.travel}vh`,
    "--motion-travel-to": `${c.travel}vh`,
    "--motion-rot-x-from": `${m.rotationX}deg`,
    "--motion-rot-x-to": `${c.rotationX}deg`,
    "--motion-rot-y-from": `${m.rotationY}deg`,
    "--motion-rot-y-to": `${c.rotationY}deg`,
    "--motion-rot-z-from": `${m.rotationZ}deg`,
    "--motion-rot-z-to": `${c.rotationZ}deg`
  };
  return [
    {
      ...t,
      name: p,
      fill: l,
      easing: i,
      custom: $2,
      startOffsetAdd: u,
      endOffsetAdd: g,
      keyframes: [
        {
          transform: `perspective(${a($2, "--motion-perspective", e)}) translateY(${a(
            $2,
            "--motion-travel-from",
            e
          )}) rotateZ(calc(${a(
            {},
            "--motion-rotate",
            false,
            "0deg"
          )} + ${a($2, "--motion-rot-z-from", e)})) rotateY(${a(
            $2,
            "--motion-rot-y-from",
            e
          )}) rotateX(${a($2, "--motion-rot-x-from", e)})`
        },
        {
          transform: `perspective(${a($2, "--motion-perspective", e)}) translateY(${a(
            $2,
            "--motion-travel-to",
            e
          )}) rotateZ(calc(${a(
            {},
            "--motion-rotate",
            false,
            "0deg"
          )} + ${a($2, "--motion-rot-z-to", e)})) rotateY(${a(
            $2,
            "--motion-rot-y-to",
            e
          )}) rotateX(${a($2, "--motion-rot-x-to", e)})`
        }
      ]
    }
  ];
}
var uc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: no, style: ro, web: Qa }, Symbol.toStringTag, { value: "Module" }));
var Wa = "clockwise";
var ts2 = {
  clockwise: 1,
  "counter-clockwise": -1
};
function ao(t) {
  return ["motion-spinScroll"];
}
function es2(t, e) {
  return so(t, true);
}
function so(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, H2, Wa), { spins: r = 0.15, scale: s = 1, range: i = "in" } = o, l = "linear", f = i === "out" ? "forwards" : i === "in" ? "backwards" : t.fill, m = ts2[n], c = r * 360, d = i === "in", u = d ? -c : i === "out" ? 0 : -c / 2, g = d ? 0 : i === "out" ? c : c / 2, [p] = ao(), $2 = {
    "--motion-spin-from": `${m * u}deg`,
    "--motion-spin-to": `${m * g}deg`,
    "--motion-spin-scale-from": d ? s : 1,
    "--motion-spin-scale-to": d ? 1 : s
  };
  return [
    {
      ...t,
      name: p,
      fill: f,
      easing: l,
      custom: $2,
      keyframes: [
        {
          transform: `scale(${a(
            $2,
            "--motion-spin-scale-from",
            e
          )}) rotate(calc(${a(
            {},
            "--motion-rotate",
            false,
            "0deg"
          )} + ${a($2, "--motion-spin-from", e)}))`
        },
        {
          transform: `scale(${a(
            $2,
            "--motion-spin-scale-to",
            e
          )}) rotate(calc(${a(
            {},
            "--motion-rotate",
            false,
            "0deg"
          )} + ${a($2, "--motion-spin-to", e)}))`
        }
      ]
    }
  ];
}
var dc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: ao, style: so, web: es2 }, Symbol.toStringTag, { value: "Module" }));
var mt2 = {
  in: [
    { opacity: 0, offset: 0 },
    { opacity: 1, offset: 0.65 }
  ],
  out: [
    { opacity: 1, offset: 0.35 },
    { opacity: 0, offset: 1 }
  ],
  continuous: [
    { opacity: 0, offset: 0 },
    { opacity: 1, offset: 0.325 },
    { opacity: 1, offset: 0.7 },
    { opacity: 0, offset: 1 }
  ]
};
function io(t) {
  const { range: e = "out" } = t.namedEffect;
  return [
    `motion-stretchScrollScale${e === "continuous" ? "-continuous" : ""}`,
    `motion-stretchScrollOpacity-${e}`
  ];
}
function os2(t, e) {
  return co(t, true);
}
function co(t, e = false) {
  const { stretch: o = 0.6, range: n = "out" } = t.namedEffect, r = n === "continuous" ? "linear" : "backInOut", s = n === "out" ? "forwards" : n === "in" ? "backwards" : t.fill, i = 1 - o, l = 1 + o, [f, m] = io(t), c = n === "out", d = D2(i), u = D2(l), g = {
    "--motion-stretch-scale-x-from": c ? 1 : d,
    "--motion-stretch-scale-y-from": c ? 1 : u,
    "--motion-stretch-scale-x-to": c ? d : 1,
    "--motion-stretch-scale-y-to": c ? u : 1,
    "--motion-stretch-trans-from": c ? 0 : `calc(-100% * (1 - ${u}))`,
    "--motion-stretch-trans-to": c ? `calc(100% * (1 - ${u}))` : 0
  }, p = [
    {
      scale: `${a(
        g,
        "--motion-stretch-scale-x-from",
        e
      )} ${a(g, "--motion-stretch-scale-y-from", e)}`,
      translate: `0 ${a(g, "--motion-stretch-trans-from", e)}`
    },
    {
      scale: `${a(
        g,
        "--motion-stretch-scale-x-to",
        e
      )} ${a(g, "--motion-stretch-scale-y-to", e)}`,
      translate: `0 ${a(g, "--motion-stretch-trans-to", e)}`
    }
  ];
  return n === "continuous" && (p.forEach(($2) => {
    Object.assign($2, { easing: z2.backInOut });
  }), p.push({
    scale: `${a(
      g,
      "--motion-stretch-scale-x-from",
      e
    )} ${a(g, "--motion-stretch-scale-y-from", e)}`,
    translate: `0 calc(100% * (1 - ${a(
      g,
      "--motion-stretch-scale-y-from",
      e
    )}))`
  })), [
    {
      ...t,
      name: f,
      fill: s,
      easing: r,
      custom: g,
      keyframes: p
    },
    {
      ...t,
      name: m,
      fill: s,
      easing: r,
      keyframes: mt2[n] || mt2.out
    }
  ];
}
var gc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: io, style: co, web: os2 }, Symbol.toStringTag, { value: "Module" }));
var ns2 = 40;
var [ut, dt, gt] = [10, 25, 25];
var rs2 = "right";
var as2 = {
  right: 1,
  left: -1
};
function lo(t) {
  return ["motion-tiltScrollTranslate", "motion-tiltScrollRotate"];
}
function ss2(t, e) {
  return fo(t, true);
}
function fo(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, L2, rs2), { parallaxFactor: r = 0, perspective: s = 400 } = o, { range: i = "in" } = o, l = "linear", f = i === "out" ? "forwards" : i === "in" ? "backwards" : t.fill, m = ns2 * r, c = as2[n], d = {
    x: ut * (i === "out" ? 0 : -1),
    y: dt * (i === "out" ? 0 : -1),
    z: gt * c * (i === "out" ? 0 : i === "in" ? 1 : -1),
    transY: i === "out" ? 0 : m
  }, u = {
    x: ut * (i === "in" ? 0 : i === "out" ? -1 : 1),
    y: dt * (i === "in" ? 0 : i === "out" ? -1 : 0.5),
    z: gt * c * (i === "in" ? 0 : i === "out" ? 1 : 1.25),
    transY: i === "in" ? 0 : -1 * m
  }, g = i === "out" ? "0px" : `${-1 * Math.abs(m)}vh`, p = i === "in" ? "0px" : `${Math.abs(m)}vh`, [$2, v] = lo(), y = {
    "--motion-perspective": `${s}px`,
    "--motion-tilt-y-from": `${d.transY}vh`,
    "--motion-tilt-y-to": `${u.transY}vh`,
    "--motion-tilt-x-from": `${d.x}deg`,
    "--motion-tilt-x-to": `${u.x}deg`,
    "--motion-tilt-y-rot-from": `${d.y}deg`,
    "--motion-tilt-y-rot-to": `${u.y}deg`,
    "--motion-tilt-z-from": `${d.z}deg`,
    "--motion-tilt-z-to": `${u.z}deg`
  };
  return [
    {
      ...t,
      name: $2,
      fill: f,
      easing: l,
      startOffsetAdd: g,
      endOffsetAdd: p,
      custom: y,
      keyframes: [
        {
          transform: `perspective(${a(y, "--motion-perspective", e)}) translateY(${a(
            y,
            "--motion-tilt-y-from",
            e
          )}) rotateX(${a(
            y,
            "--motion-tilt-x-from",
            e
          )}) rotateY(${a(y, "--motion-tilt-y-rot-from", e)})`
        },
        {
          transform: `perspective(${a(y, "--motion-perspective", e)}) translateY(${a(
            y,
            "--motion-tilt-y-to",
            e
          )}) rotateX(${a(
            y,
            "--motion-tilt-x-to",
            e
          )}) rotateY(${a(y, "--motion-tilt-y-rot-to", e)})`
        }
      ]
    },
    {
      ...t,
      name: v,
      fill: f,
      easing: z2.sineInOut,
      startOffsetAdd: g,
      endOffsetAdd: p,
      composite: "add",
      // add this animation on top of the previous one
      custom: y,
      keyframes: [
        {
          transform: `rotate(calc(${a(
            {},
            "--motion-rotate",
            false,
            "0deg"
          )} + ${a(y, "--motion-tilt-z-from", e)}))`
        },
        {
          transform: `rotate(calc(${a(
            {},
            "--motion-rotate",
            false,
            "0deg"
          )} + ${a(y, "--motion-tilt-z-to", e)}))`
        }
      ]
    }
  ];
}
var $c = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: lo, style: fo, web: ss2 }, Symbol.toStringTag, { value: "Module" }));
var is2 = 45;
var cs2 = "right";
var ls2 = "clockwise";
var fs2 = {
  clockwise: 1,
  "counter-clockwise": -1
};
function mo(t) {
  return ["motion-turnScroll"];
}
function uo(t, e) {
  if (e) {
    let o = 0;
    e.measure((n) => {
      n && (o = n.getBoundingClientRect().left);
    }), e.mutate((n) => {
      n?.style.setProperty("--motion-left", `${o}px`);
    });
  }
}
function ms2(t, e) {
  return uo(t, e), go(t, true);
}
function go(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, L2, cs2), r = _2(o?.spin, H2, ls2), { scale: s = 1, range: i = "in" } = o, l = "linear", f = i === "out" ? "forwards" : i === "in" ? "backwards" : t.fill, m = `calc(-1 * ${a(
    {},
    "--motion-left",
    false,
    "calc(100vw - 100%)"
  )} - 100%)`, c = `calc(100vw - ${a({}, "--motion-left", false, "0px")})`, [d, u] = n === "left" ? [m, c] : [c, m], g = is2 * fs2[r], p = {
    rotation: i === "out" ? 0 : -g,
    scale: i === "out" ? 1 : s,
    translate: i === "out" ? "0px" : d
  }, $2 = {
    rotation: i === "in" ? 0 : g,
    scale: i === "in" ? 1 : s,
    translate: i === "in" ? "0px" : u
  }, [v] = mo(), y = {
    "--motion-turn-translate-from": p.translate,
    "--motion-turn-translate-to": $2.translate,
    "--motion-turn-scale-from": p.scale,
    "--motion-turn-scale-to": $2.scale,
    "--motion-turn-rotation-from": `${p.rotation}deg`,
    "--motion-turn-rotation-to": `${$2.rotation}deg`
  };
  return [
    {
      ...t,
      name: v,
      fill: f,
      easing: l,
      custom: y,
      keyframes: [
        {
          transform: `translateX(${a(
            y,
            "--motion-turn-translate-from",
            e
          )}) scale(${a(
            y,
            "--motion-turn-scale-from",
            e
          )}) rotate(calc(${a(
            {},
            "--motion-rotate",
            false,
            "0deg"
          )} + ${a(y, "--motion-turn-rotation-from", e)}))`
        },
        {
          transform: `translateX(${a(
            y,
            "--motion-turn-translate-to",
            e
          )}) scale(${a(
            y,
            "--motion-turn-scale-to",
            e
          )}) rotate(calc(${a(
            {},
            "--motion-rotate",
            false,
            "0deg"
          )} + ${a(y, "--motion-turn-rotation-to", e)}))`
        }
      ]
    }
  ];
}
var pc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: mo, prepare: uo, style: go, web: ms2 }, Symbol.toStringTag, { value: "Module" }));
var $t2 = 80;
var us2 = "right";
var ds2 = { value: 200, unit: "px" };
var gs2 = {
  top: { x: 1, y: 0, sign: 1 },
  right: { x: 0, y: 1, sign: 1 },
  bottom: { x: 1, y: 0, sign: -1 },
  left: { x: 0, y: 1, sign: -1 }
};
function $s2(t, e) {
  return po(t, true);
}
function $o(t) {
  return ["motion-fadeIn", "motion-arcIn"];
}
function po(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, w, us2), r = A2(o.depth, ds2), { perspective: s = 800 } = o, [i, l] = $o(), f = t.easing || "quintInOut", { x: m, y: c, sign: d } = gs2[n], u = `${r.value}${r.unit === "percentage" ? "%" : r.unit}`, g = {
    "--motion-perspective": `${s}px`,
    "--motion-arc-x": `${m}`,
    "--motion-arc-y": `${c}`,
    "--motion-arc-sign": `${d}`,
    "--motion-depth-negative": `calc(-1 * ${u} / 2)`,
    "--motion-depth-positive": `calc(${u} / 2)`
  };
  return [
    {
      ...t,
      name: i,
      duration: t.duration * 0.7,
      easing: "sineIn",
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      name: l,
      easing: f,
      custom: g,
      keyframes: [
        {
          transform: `perspective(${a(g, "--motion-perspective", e)}) translateZ(${a(g, "--motion-depth-negative", e)}) rotateX(calc(${a(
            g,
            "--motion-arc-x",
            e
          )} * ${a(
            g,
            "--motion-arc-sign",
            e
          )} * ${$t2}deg)) rotateY(calc(${a(
            g,
            "--motion-arc-y",
            e
          )} * ${a(
            g,
            "--motion-arc-sign",
            e
          )} * ${$t2}deg)) translateZ(${a(g, "--motion-depth-positive", e)}) rotate(var(--motion-rotate, 0deg))`
        },
        {
          transform: `perspective(${a(g, "--motion-perspective", e)}) translateZ(${a(g, "--motion-depth-negative", e)}) rotateX(0deg) rotateY(0deg) translateZ(${a(g, "--motion-depth-positive", e)}) rotate(var(--motion-rotate, 0deg))`
        }
      ]
    }
  ];
}
var yc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: $o, style: po, web: $s2 }, Symbol.toStringTag, { value: "Module" }));
function yo(t) {
  return ["motion-fadeIn", "motion-blurIn"];
}
function ps2(t) {
  return vo(t, true);
}
function vo(t, e = false) {
  const { blur: o = 6 } = t.namedEffect, [n, r] = yo(), s = t.easing || "linear", i = {
    "--motion-blur": `${o}px`
  };
  return [
    {
      ...t,
      name: n,
      duration: t.duration * 0.7,
      easing: "sineIn",
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      name: r,
      easing: s,
      composite: "add",
      // make sure we don't override existing filters on the component
      custom: i,
      keyframes: [
        {
          filter: `blur(${a(i, "--motion-blur", e)})`
        },
        {
          filter: "blur(0px)"
        }
      ]
    }
  ];
}
var vc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: yo, style: vo, web: ps2 }, Symbol.toStringTag, { value: "Module" }));
var ys2 = "right";
function _o(t) {
  return ["motion-shuttersIn", "motion-fadeIn"];
}
function vs2(t) {
  return ho(t, true);
}
function ho(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, w, ys2), { shutters: r = 12, staggered: s = true } = o, [i, l] = _o(), { clipStart: f, clipEnd: m } = tt2(n, r, s), c = {
    "--motion-shutters-start": f,
    "--motion-shutters-end": m
  }, d = S(t.easing || "sineIn");
  return [
    {
      ...t,
      easing: d,
      name: i,
      custom: c,
      keyframes: [
        {
          clipPath: a(c, "--motion-shutters-start", e)
        },
        {
          clipPath: a(c, "--motion-shutters-end", e)
        }
      ]
    },
    {
      ...t,
      name: l,
      custom: {},
      keyframes: [{ opacity: 0, offset: 0, easing: "step-start" }]
    }
  ];
}
var _c = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: _o, style: ho, web: vs2 }, Symbol.toStringTag, { value: "Module" }));
var _s2 = [...w, "center"];
var hs2 = "bottom";
function Eo(t) {
  return ["motion-fadeIn", "motion-bounceIn"];
}
var { in: Es2, out: Os2 } = K2("sineIn");
var pt = [
  { offset: 0, translate: 100 },
  { offset: 30, translate: 0 },
  { offset: 42, translate: 35 },
  { offset: 54, translate: 0 },
  { offset: 62, translate: 21 },
  { offset: 74, translate: 0 },
  { offset: 82, translate: 9 },
  { offset: 90, translate: 0 },
  { offset: 95, translate: 2 },
  { offset: 100, translate: 0, isIn: true }
];
var xs2 = {
  top: { y: -1, x: 0, z: 0 },
  right: { y: 0, x: 1, z: 0 },
  bottom: { y: 1, x: 0, z: 0 },
  left: { y: 0, x: -1, z: 0 },
  center: { x: 0, y: 0, z: -1 }
};
function Is2(t) {
  return Oo(t, true);
}
function Oo(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, _s2, hs2), r = o?.distanceFactor || 1, { perspective: s = 800 } = o || {}, [i, l] = Eo(), f = n === "center" ? `perspective(${s}px)` : " ", { x: m, y: c, z: d } = xs2[n], u = {
    "--motion-direction-x": m,
    "--motion-direction-y": c,
    "--motion-direction-z": d,
    "--motion-distance-factor": r,
    "--motion-perspective": f,
    "--motion-ease-in": S(Os2),
    "--motion-ease-out": S(Es2)
  }, g = a(u, "--motion-ease-in", e), p = a(u, "--motion-ease-out", e), $2 = a(u, "--motion-distance-factor", e), v = a(u, "--motion-perspective", e, ""), y = a(u, "--motion-direction-x", e), O2 = a(u, "--motion-direction-y", e), x3 = a(u, "--motion-direction-z", e), T = pt.map(({ offset: E, translate: b2 }, X2) => ({
    offset: E / 100,
    animationTimingFunction: X2 % 2 ? g : p,
    transform: `${v.trim()} translate3d(calc(${y} * ${$2} * ${b2 / 2}px), calc(${O2} * ${$2} * ${b2 / 2}px), calc(${x3} * ${$2} * ${b2 / 2}px)) rotateZ(var(--motion-rotate, 0deg))`
  }));
  return [
    {
      ...t,
      name: i,
      easing: "quadOut",
      duration: t.duration * pt[3].offset / 100,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      name: l,
      easing: "linear",
      custom: u,
      keyframes: T
    }
  ];
}
var hc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Eo, style: Oo, web: Is2 }, Symbol.toStringTag, { value: "Module" }));
var Ss2 = { value: 300, unit: "px" };
var Ts2 = [...L2, "pseudoLeft", "pseudoRight"];
var bs2 = "right";
function xo(t) {
  return ["motion-curveIn", "motion-fadeIn"];
}
var As2 = {
  pseudoRight: { rotationX: "180", rotationY: "0" },
  right: { rotationX: "0", rotationY: "180" },
  pseudoLeft: { rotationX: "-180", rotationY: "0" },
  left: { rotationX: "0", rotationY: "-180" }
};
function ws2(t, e) {
  return Io(t, true);
}
function Io(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, Ts2, bs2), r = A2(o.depth, Ss2), { perspective: s = 200 } = o, [i, l] = xo(), { rotationX: f, rotationY: m } = As2[n], c = `${r.value}${r.unit === "percentage" ? "%" : r.unit}`, d = {
    "--motion-perspective": `${s}px`,
    "--motion-rotate-x": `${f}deg`,
    "--motion-rotate-y": `${m}deg`,
    "--motion-depth-negative": `calc(${c} * -3)`,
    "--motion-depth-positive": `calc(${c} * 3)`
  }, u = "quadOut";
  return [
    {
      ...t,
      name: i,
      easing: u,
      custom: d,
      keyframes: [
        {
          transform: `perspective(${a(d, "--motion-perspective", e)}) translateZ(${a(d, "--motion-depth-negative", e)}) rotateX(${a(
            d,
            "--motion-rotate-x",
            e
          )}) rotateY(${a(
            d,
            "--motion-rotate-y",
            e
          )}) translateZ(${a(d, "--motion-depth-positive", e)}) rotateZ(var(--motion-rotate, 0deg))`
        },
        {
          transform: `perspective(${a(d, "--motion-perspective", e)}) translateZ(${a(d, "--motion-depth-negative", e)}) rotateX(0deg) rotateY(0deg) translateZ(${a(d, "--motion-depth-positive", e)}) rotateZ(var(--motion-rotate, 0deg))`
        }
      ]
    },
    {
      ...t,
      name: l,
      easing: u,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    }
  ];
}
var Ec = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: xo, style: Io, web: ws2 }, Symbol.toStringTag, { value: "Module" }));
function So(t) {
  return ["motion-fadeIn", "motion-dropIn"];
}
function Ns(t) {
  return To(t, true);
}
function To(t, e = false) {
  const { initialScale: o = 1.6 } = t.namedEffect, [n, r] = So(), s = t.easing || "quintInOut", i = {
    "--motion-scale": `${o}`
  };
  return [
    {
      ...t,
      name: n,
      easing: "quadOut",
      duration: t.duration * 0.8,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      name: r,
      easing: s,
      custom: i,
      keyframes: [
        {
          scale: a(i, "--motion-scale", e)
        },
        {
          scale: "1"
        }
      ]
    }
  ];
}
var Oc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: So, style: To, web: Ns }, Symbol.toStringTag, { value: "Module" }));
var Ds = 90;
var ks2 = { value: 120, unit: "percentage" };
var Fs = {
  top: 90,
  right: 0,
  bottom: 270,
  left: 180
};
function bo(t) {
  return ["motion-fadeIn", "motion-expandIn"];
}
function Ps2(t) {
  return Ao(t, true);
}
function Ao(t, e = false) {
  const o = t.namedEffect, { initialScale: n = 0 } = o, r = _2(
    o?.direction,
    w,
    Ds,
    true
  ), s = typeof r == "string" ? Fs[r] : r, i = A2(o.distance, ks2), [l, f] = bo(), m = t.easing || "cubicInOut", c = s * Math.PI / 180, d = N2(i.unit), u = `${Math.cos(c) * i.value | 0}${d}`, g = `${Math.sin(c) * i.value * -1 | 0}${d}`, p = {
    "--motion-translate-x": `${u}`,
    "--motion-translate-y": `${g}`,
    "--motion-scale": `${n}`
  };
  return [
    {
      ...t,
      easing: m,
      duration: t.duration * 0.7,
      name: l,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      easing: m,
      name: f,
      custom: p,
      keyframes: [
        {
          transform: `translate(${a(
            p,
            "--motion-translate-x",
            e
          )}, ${a(
            p,
            "--motion-translate-y",
            e
          )}) rotate(var(--motion-rotate, 0deg)) scale(${a(
            p,
            "--motion-scale",
            e
          )})`
        },
        {
          transform: "translate(0px, 0px) rotate(var(--motion-rotate, 0deg)) scale(1)"
        }
      ]
    }
  ];
}
var xc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: bo, style: Ao, web: Ps2 }, Symbol.toStringTag, { value: "Module" }));
function wo(t) {
  return ["motion-fadeIn"];
}
function Rs(t) {
  return No(t);
}
function No(t) {
  const [e] = wo();
  return [
    {
      ...t,
      name: e,
      easing: "sineInOut",
      keyframes: [{ offset: 0, opacity: 0 }]
    }
  ];
}
var Ic = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: wo, style: No, web: Rs }, Symbol.toStringTag, { value: "Module" }));
var Ms2 = "top";
function Do(t) {
  return ["motion-fadeIn", "motion-flipIn"];
}
function Ys(t, e) {
  return {
    x: yt[t].x * e,
    y: yt[t].y * e
  };
}
var yt = {
  top: { x: 1, y: 0 },
  right: { x: 0, y: 1 },
  bottom: { x: -1, y: 0 },
  left: { x: 0, y: -1 }
};
function js(t) {
  return ko(t, true);
}
function ko(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, w, Ms2), { initialRotate: r = 90, perspective: s = 800 } = o, [i, l] = Do(), f = t.easing || "backOut", m = Ys(n, r), c = {
    "--motion-perspective": `${s}px`,
    "--motion-rotate-x": `${m.x}deg`,
    "--motion-rotate-y": `${m.y}deg`
  };
  return [
    {
      ...t,
      easing: "quadOut",
      name: i,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      easing: f,
      name: l,
      custom: c,
      keyframes: [
        {
          transform: `perspective(${a(c, "--motion-perspective", e)}) rotate(var(--motion-rotate, 0deg)) rotateX(var(--motion-rotate-x, ${c["--motion-rotate-x"]})) rotateY(var(--motion-rotate-y, ${c["--motion-rotate-y"]}))`
        },
        {
          transform: `perspective(${a(c, "--motion-perspective", e)}) rotate(var(--motion-rotate, 0deg)) rotateX(0deg) rotateY(0deg)`
        }
      ]
    }
  ];
}
var Sc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Do, style: ko, web: js }, Symbol.toStringTag, { value: "Module" }));
var Cs2 = "left";
function Fo(t) {
  return ["motion-floatIn", "motion-fadeIn"];
}
var zs = {
  top: { dx: 0, dy: -1, distance: 120 },
  right: { dx: 1, dy: 0, distance: 120 },
  bottom: { dx: 0, dy: 1, distance: 120 },
  left: { dx: -1, dy: 0, distance: 120 }
};
function Ls(t) {
  return Po(t, true);
}
function Po(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, w, Cs2), [r, s] = Fo(), i = zs[n], l = i.dx * i.distance, f = i.dy * i.distance, m = {
    "--motion-translate-x": `${l}px`,
    "--motion-translate-y": `${f}px`
  }, c = "sineInOut";
  return [
    {
      ...t,
      name: r,
      easing: c,
      custom: m,
      keyframes: [
        {
          transform: `translate(${a(
            m,
            "--motion-translate-x",
            e
          )}, ${a(
            m,
            "--motion-translate-y",
            e
          )}) rotate(var(--motion-rotate, 0deg))`
        },
        {
          transform: "translate(0, 0) rotate(var(--motion-rotate, 0deg))"
        }
      ]
    },
    {
      ...t,
      name: s,
      easing: c,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    }
  ];
}
var Tc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Fo, style: Po, web: Ls }, Symbol.toStringTag, { value: "Module" }));
function Ro(t) {
  return ["motion-fadeIn", "motion-foldIn"];
}
var Xs2 = "top";
var et2 = {
  top: { x: -1, y: 0, origin: { x: 0, y: -50 } },
  right: { x: 0, y: -1, origin: { x: 50, y: 0 } },
  bottom: { x: 1, y: 0, origin: { x: 0, y: 50 } },
  left: { x: 0, y: 1, origin: { x: -50, y: 0 } }
};
function Us2(t, e) {
  return {
    x: et2[t].x * e,
    y: et2[t].y * e
  };
}
function Bs(t) {
  return Mo(t, true);
}
function Mo(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, w, Xs2), { initialRotate: r = 90, perspective: s = 800 } = o, [i, l] = Ro(), f = t.easing || "backOut", { x: m, y: c } = et2[n].origin, d = Us2(n, r), u = {
    "--motion-perspective": `${s}px`,
    "--motion-origin-x": `${m}%`,
    "--motion-origin-y": `${c}%`,
    "--motion-rotate-x": `${d.x}deg`,
    "--motion-rotate-y": `${d.y}deg`
  };
  return [
    {
      ...t,
      easing: "quadOut",
      name: i,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      easing: f,
      name: l,
      custom: u,
      keyframes: [
        {
          transform: `rotate(var(--motion-rotate, 0deg)) translate(var(--motion-origin-x, ${u["--motion-origin-x"]}), var(--motion-origin-y, ${u["--motion-origin-y"]})) perspective(${a(u, "--motion-perspective", e)}) rotateX(var(--motion-rotate-x, ${u["--motion-rotate-x"]})) rotateY(var(--motion-rotate-y, ${u["--motion-rotate-y"]})) translate(calc(-1 * var(--motion-origin-x, ${u["--motion-origin-x"]})), calc(-1 * var(--motion-origin-y, ${u["--motion-origin-y"]})))`
        },
        {
          transform: `rotate(var(--motion-rotate, 0deg)) translate(var(--motion-origin-x, ${u["--motion-origin-x"]}), var(--motion-origin-y, ${u["--motion-origin-y"]})) perspective(${a(u, "--motion-perspective", e)}) rotateX(0deg) rotateY(0deg) translate(calc(-1 * var(--motion-origin-x, ${u["--motion-origin-x"]})), calc(-1 * var(--motion-origin-y, ${u["--motion-origin-y"]})))`
        }
      ]
    }
  ];
}
var bc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Ro, style: Mo, web: Bs }, Symbol.toStringTag, { value: "Module" }));
var Zs2 = 180;
var Gs = { value: 100, unit: "percentage" };
var Vs = {
  top: 90,
  right: 0,
  bottom: 270,
  left: 180
};
var Ks = true;
function Yo(t) {
  return ["motion-glideIn", "motion-fadeIn"];
}
function Hs(t) {
  return jo(t, true);
}
function jo(t, e = false) {
  const o = t.namedEffect, n = _2(
    o?.direction,
    w,
    Zs2,
    Ks
  ), r = typeof n == "string" ? Vs[n] : n, s = A2(o.distance, Gs), i = r * Math.PI / 180, l = N2(s.unit), f = t.easing || "quintInOut", m = `${Math.cos(i) * s.value | 0}${l}`, c = `${Math.sin(i) * s.value * -1 | 0}${l}`, d = {
    "--motion-translate-x": `${m}`,
    "--motion-translate-y": `${c}`
  }, [u, g] = Yo();
  return [
    {
      ...t,
      name: u,
      easing: f,
      custom: d,
      keyframes: [
        {
          transform: `translate(${a(
            d,
            "--motion-translate-x",
            e
          )}, ${a(
            d,
            "--motion-translate-y",
            e
          )}) rotate(var(--motion-rotate, 0deg))`
        },
        {
          transform: "translate(0, 0) rotate(var(--motion-rotate, 0deg))"
        }
      ]
    },
    {
      ...t,
      name: g,
      custom: {},
      keyframes: [{ opacity: 0, offset: 0, easing: "step-start" }]
    }
  ];
}
var Ac = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Yo, style: jo, web: Hs }, Symbol.toStringTag, { value: "Module" }));
function Co(t) {
  return ["motion-fadeIn", "motion-shapeIn"];
}
var qs2 = {
  diamond: {
    start: "polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)",
    end: "polygon(50% -50%, 150% 50%, 50% 150%, -50% 50%)"
  },
  window: {
    start: "inset(50% round 50% 50% 0% 0%)",
    end: "inset(-20% round 50% 50% 0% 0%)"
  },
  rectangle: { start: "inset(50%)", end: "inset(0%)" },
  circle: { start: "circle(0%)", end: "circle(75%)" },
  ellipse: { start: "ellipse(0% 0%)", end: "ellipse(75% 75%)" }
};
function Js(t) {
  return zo(t, true);
}
function zo(t, e = false) {
  const { shape: o = "rectangle" } = t.namedEffect, [n, r] = Co(), s = t.easing || "cubicInOut", { start: i, end: l } = qs2[o], f = {
    "--motion-shape-start": i,
    "--motion-shape-end": l
  };
  return [
    {
      ...t,
      name: n,
      easing: "quadOut",
      duration: t.duration * 0.8,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      name: r,
      easing: s,
      custom: f,
      keyframes: [
        {
          clipPath: a(f, "--motion-shape-start", e)
        },
        {
          clipPath: a(f, "--motion-shape-end", e)
        }
      ]
    }
  ];
}
var wc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Co, style: zo, web: Js }, Symbol.toStringTag, { value: "Module" }));
var Qs = "left";
function Lo(t) {
  return ["motion-revealIn", "motion-fadeIn"];
}
function Ws(t) {
  return Xo(t);
}
function Xo(t) {
  const e = t.namedEffect, o = _2(e?.direction, w, Qs), [n, r] = Lo(), s = t.easing || "cubicInOut", i = R2({ direction: o, minimum: 0 }), l = R2({ direction: "initial" });
  return [
    {
      ...t,
      easing: s,
      name: n,
      custom: {
        "--motion-clip-start": i
      },
      keyframes: [
        {
          clipPath: `var(--motion-clip-start, ${i})`
        },
        {
          clipPath: l
        }
      ]
    },
    {
      ...t,
      name: r,
      easing: s,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    }
  ];
}
var Nc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Lo, style: Xo, web: Ws }, Symbol.toStringTag, { value: "Module" }));
var ti = "left";
function Uo(t) {
  return ["motion-slideIn", "motion-fadeIn"];
}
var W2 = {
  top: { dx: 0, dy: -1, clip: "bottom" },
  right: { dx: 1, dy: 0, clip: "left" },
  bottom: { dx: 0, dy: 1, clip: "top" },
  left: { dx: -1, dy: 0, clip: "right" }
};
function ei(t) {
  return Bo(t);
}
function Bo(t) {
  const e = t.namedEffect, o = _2(e?.direction, w, ti), { initialTranslate: n = 1 } = e, [r, s] = Uo(), i = t.easing || "cubicInOut", l = 100 - n * 100, f = R2({
    direction: W2[o].clip,
    minimum: l
  }), m = R2({ direction: "initial" }), c = {
    "--motion-clip-start": f,
    "--motion-translate-x": `${W2[o].dx * 100}%`,
    "--motion-translate-y": `${W2[o].dy * 100}%`
  };
  return [
    {
      ...t,
      name: r,
      easing: i,
      custom: c,
      keyframes: [
        {
          transform: `rotate(var(--motion-rotate, 0deg)) translate(var(--motion-translate-x, ${c["--motion-translate-x"]}), var(--motion-translate-y, ${c["--motion-translate-y"]}))`,
          clipPath: `var(--motion-clip-start, ${c["--motion-clip-start"]})`
        },
        {
          transform: "rotate(var(--motion-rotate, 0deg)) translate(0px, 0px)",
          clipPath: m
        }
      ]
    },
    {
      ...t,
      name: s,
      easing: i,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    }
  ];
}
var Dc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Uo, style: Bo, web: ei }, Symbol.toStringTag, { value: "Module" }));
var oi = "clockwise";
function Zo(t) {
  return ["motion-fadeIn", "motion-spinIn"];
}
var ni = {
  clockwise: -1,
  "counter-clockwise": 1
};
function ri(t) {
  return Go(t, true);
}
function Go(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, H2, oi), { spins: r = 0.5, initialScale: s = 0 } = o, [i, l] = Zo(), f = t.easing || "cubicInOut", m = (ni[n] > 0 ? 1 : -1) * 360 * r, c = {
    "--motion-scale": `${s}`,
    "--motion-rotate": `${m}deg`
  };
  return [
    {
      ...t,
      name: i,
      easing: "cubicIn",
      duration: t.duration * s,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      name: l,
      easing: f,
      custom: c,
      keyframes: [
        {
          scale: a(c, "--motion-scale", e),
          rotate: a(c, "--motion-rotate", e)
        },
        {
          scale: "1",
          rotate: "0deg"
        }
      ]
    }
  ];
}
var kc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Zo, style: Go, web: ri }, Symbol.toStringTag, { value: "Module" }));
var ai = "left";
var si = { value: 200, unit: "px" };
function Vo(t) {
  return ["motion-fadeIn", "motion-tiltInRotate", "motion-tiltInClip"];
}
var ii = {
  left: 30,
  right: -30
};
function ci(t) {
  return Ko(t, true);
}
function Ko(t, e = false) {
  const o = t.namedEffect, n = _2(o?.direction, L2, ai), r = A2(o.depth, si), { perspective: s = 800 } = o, [i, l, f] = Vo(), m = t.easing || "cubicOut", c = R2({ direction: "top", minimum: 0 }), d = ii[n], u = R2({ direction: "initial" }), g = `${r.value}${r.unit === "percentage" ? "%" : r.unit}`, p = {
    "--motion-perspective": `${s}px`,
    "--motion-depth-negative": `calc(${g} / 2 * -1)`,
    "--motion-depth-positive": `calc(${g} / 2)`
  }, $2 = {
    "--motion-rotate-z": `${d}deg`,
    "--motion-clip-start": c
  };
  return [
    {
      ...t,
      name: i,
      duration: t.duration * 0.2,
      easing: "cubicOut",
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      name: l,
      easing: m,
      custom: p,
      keyframes: [
        {
          transform: `perspective(${a(p, "--motion-perspective", e)}) translateZ(${a(p, "--motion-depth-negative", e)}) rotateX(-90deg) translateZ(${a(p, "--motion-depth-positive", e)}) rotate(var(--motion-rotate, 0deg))`
        },
        {
          transform: `perspective(${a(p, "--motion-perspective", e)}) translateZ(${a(p, "--motion-depth-negative", e)}) rotateX(0deg) translateZ(${a(p, "--motion-depth-positive", e)}) rotate(var(--motion-rotate, 0deg))`
        }
      ]
    },
    {
      ...t,
      name: f,
      easing: m,
      composite: "add",
      duration: t.duration * 0.8,
      custom: $2,
      keyframes: [
        {
          clipPath: `var(--motion-clip-start, ${$2["--motion-clip-start"]})`,
          transform: `rotateZ(${a($2, "--motion-rotate-z", e)})`
        },
        {
          clipPath: u,
          transform: "rotateZ(0deg)"
        }
      ]
    }
  ];
}
var Fc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Vo, style: Ko, web: ci }, Symbol.toStringTag, { value: "Module" }));
var li = "top-left";
function Ho(t) {
  return ["motion-fadeIn", "motion-turnIn"];
}
var fi = {
  "top-left": { angle: -50, x: -50, y: -50 },
  "top-right": { angle: 50, x: 50, y: -50 },
  "bottom-right": { angle: 50, x: 50, y: 50 },
  "bottom-left": { angle: -50, x: -50, y: 50 }
};
function mi(t) {
  return qo(t, true);
}
function qo(t, e = false) {
  const o = t.namedEffect, n = _2(
    o?.direction,
    Or,
    li
  ), [r, s] = Ho(), i = t.easing || "backOut", { x: l, y: f, angle: m } = fi[n], c = {
    "--motion-origin": `${l}%, ${f}%`,
    "--motion-origin-invert": `${-l}%, ${-f}%`,
    "--motion-rotate-z": `${m}deg`
  }, d = a(c, "--motion-origin", e), u = a(c, "--motion-origin-invert", e);
  return [
    {
      ...t,
      name: r,
      duration: t.duration * 0.6,
      easing: "sineIn",
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      name: s,
      easing: i,
      custom: c,
      keyframes: [
        {
          transform: `translate(${d}) rotate(${a(
            c,
            "--motion-rotate-z",
            e
          )}) translate(${u}) rotate(var(--motion-rotate, 0deg))`
        },
        {
          transform: `translate(${d}) rotate(0deg) translate(${u}) rotate(var(--motion-rotate, 0deg))`
        }
      ]
    }
  ];
}
var Pc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Ho, style: qo, web: mi }, Symbol.toStringTag, { value: "Module" }));
var ui = "horizontal";
function Jo(t) {
  return ["motion-fadeIn", "motion-winkInClip", "motion-winkInRotate"];
}
var di = {
  vertical: { scaleY: 0, scaleX: 1 },
  horizontal: { scaleY: 1, scaleX: 0 }
};
function gi(t) {
  return Qo(t);
}
function Qo(t) {
  const e = t.namedEffect, o = _2(e?.direction, B2, ui), [n, r, s] = Jo(), { scaleX: i, scaleY: l } = di[o], f = t.easing || "quintInOut", m = R2({ direction: o, minimum: 100 }), c = R2({ direction: "initial" }), d = {
    "--motion-scale-x": i,
    "--motion-scale-y": l,
    "--motion-clip-start": m
  };
  return [
    {
      ...t,
      easing: "quadOut",
      name: n,
      custom: {},
      keyframes: [{ offset: 0, opacity: 0 }]
    },
    {
      ...t,
      easing: f,
      name: r,
      custom: d,
      keyframes: [
        {
          clipPath: `var(--motion-clip-start, ${d["--motion-clip-start"]})`
        },
        {
          clipPath: c
        }
      ]
    },
    {
      ...t,
      duration: t.duration * 0.85,
      easing: f,
      name: s,
      custom: d,
      keyframes: [
        {
          transform: `rotate(var(--motion-rotate, 0deg)) scale(var(--motion-scale-x, ${d["--motion-scale-x"]}), var(--motion-scale-y, ${d["--motion-scale-y"]}))`
        },
        {
          transform: "rotate(var(--motion-rotate, 0deg)) scale(1, 1)"
        }
      ]
    }
  ];
}
var Rc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({ __proto__: null, getNames: Jo, style: Qo, web: gi }, Symbol.toStringTag, { value: "Module" }));

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience-renderer/src/pipeline/interact.ts
var registeredEffects = /* @__PURE__ */ new Set();
function collectNamedEffectTypes(config) {
  const types = /* @__PURE__ */ new Set();
  for (const effect of Object.values(config.effects)) {
    if (effect.namedEffect) types.add(effect.namedEffect.type);
  }
  if (config.sequences) {
    for (const seq of Object.values(config.sequences)) {
      for (const entry of seq.effects) {
        const effect = entry;
        if (effect.namedEffect) types.add(effect.namedEffect.type);
      }
    }
  }
  for (const interaction of config.interactions) {
    if (interaction.effects) {
      for (const entry of interaction.effects) {
        const effect = entry;
        if (effect.namedEffect) types.add(effect.namedEffect.type);
      }
    }
    if (interaction.sequences) {
      for (const seq of interaction.sequences) {
        const seqConfig = seq;
        if (seqConfig.effects) {
          for (const entry of seqConfig.effects) {
            const effect = entry;
            if (effect.namedEffect) types.add(effect.namedEffect.type);
          }
        }
      }
    }
  }
  return types;
}
function registerNamedEffects(config) {
  const types = collectNamedEffectTypes(config);
  for (const type of types) {
    if (registeredEffects.has(type)) continue;
    const preset = motion_presets_exports[type];
    if (preset) {
      b.registerEffects({ [type]: preset });
      registeredEffects.add(type);
    }
  }
}
function stripInteractionId(interaction) {
  const { id: _3, ...rest } = interaction;
  return rest;
}
function toInteractConfig(config) {
  return {
    effects: config.effects,
    sequences: config.sequences,
    conditions: config.conditions,
    interactions: config.interactions.map(stripInteractionId)
  };
}
function createInteractInstance(config, elements) {
  registerNamedEffects(config);
  b.allowA11yTriggers = true;
  const interactConfig = toInteractConfig(config);
  const instance = b.create(interactConfig);
  for (const nodes of elements.values()) {
    for (const el of nodes) {
      Us(el);
    }
  }
  return { instance, currentConfig: config };
}
function initInteract(config, elements) {
  let state = null;
  try {
    state = createInteractInstance(config, elements);
  } catch (err) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("Interact.create() failed:", err);
    }
  }
  return {
    update(newConfig, newElements) {
      state?.instance.destroy();
      try {
        state = createInteractInstance(newConfig, newElements);
      } catch (err) {
        state = null;
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.warn("Interact.create() failed on update:", err);
        }
      }
    },
    destroy() {
      state?.instance.destroy();
      state = null;
    }
  };
}

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience-renderer/src/pipeline/teardown.ts
function teardown(interactSurface, styleSurface, elements, scopeElement) {
  interactSurface?.destroy();
  styleSurface?.destroy();
  clearElementAttributes(elements);
  if (scopeElement) delete scopeElement.dataset.experienceId;
}

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience-renderer/src/pipeline/diff.ts
function elementSelectors(elements) {
  return Object.fromEntries(Object.entries(elements).map(([k3, v]) => [k3, v.selector]));
}
function elementStyles(elements) {
  return Object.fromEntries(Object.entries(elements).map(([k3, v]) => [k3, v.styles]));
}
function diffConfigs(prev, next) {
  const varsChanged = JSON.stringify(prev.variables) !== JSON.stringify(next.variables);
  const interactChanged = JSON.stringify(prev.experience.interact) !== JSON.stringify(next.experience.interact);
  const elementSelectorsChanged = JSON.stringify(elementSelectors(prev.experience.elements)) !== JSON.stringify(elementSelectors(next.experience.elements));
  if (interactChanged || elementSelectorsChanged) {
    return { tier: "structural" };
  }
  const elementStylesChanged = JSON.stringify(elementStyles(prev.experience.elements)) !== JSON.stringify(elementStyles(next.experience.elements));
  const styleRulesChanged = JSON.stringify(prev.experience.styles) !== JSON.stringify(next.experience.styles);
  if (elementStylesChanged || styleRulesChanged) {
    return { tier: "css-only" };
  }
  if (varsChanged) {
    return { tier: "variables-only" };
  }
  return { tier: "variables-only" };
}

// ../../../Documents/Dev/Wix/interact-xp/packages/interact-experience-renderer/src/index.ts
function createExperience(experience, options = {}) {
  const root = options.root ?? document;
  const store = "store" in options ? options.store : void 0;
  const scopeElement = root instanceof Document ? document.documentElement : root;
  let userValues = store ? {} : "controlValues" in options && options.controlValues || {};
  let conditionState = null;
  let prev = null;
  let elements = /* @__PURE__ */ new Map();
  let styleSurface = null;
  let interactSurface = null;
  let storeUnsubscribe = null;
  function mount() {
    if (interactSurface || styleSurface) return;
    scopeElement.dataset.experienceId = experience.id;
    const snapshot = resolveControls(experience, { controlValues: userValues, store });
    elements = selectElements(snapshot.experience.elements, root);
    styleSurface = renderStyles(snapshot.experience, snapshot.variables, scopeElement);
    interactSurface = initInteract(snapshot.experience.interact, elements);
    prev = snapshot;
  }
  function unmount() {
    if (!interactSurface && !styleSurface) return;
    teardown(interactSurface, styleSurface, elements, scopeElement);
    interactSurface = null;
    styleSurface = null;
    elements = /* @__PURE__ */ new Map();
    prev = null;
  }
  function dispatchUpdate(next) {
    if (!prev) return;
    const diff = diffConfigs(prev, next);
    switch (diff.tier) {
      case "variables-only":
        styleSurface?.setVariables(next.variables);
        prev = next;
        break;
      case "css-only":
        styleSurface?.update(next.experience, next.variables);
        prev = next;
        break;
      case "structural":
        unmount();
        mount();
        break;
    }
  }
  conditionState = evaluateConditions(experience.disableWhen, (disabled) => {
    if (disabled) {
      unmount();
    } else {
      mount();
    }
  });
  if (store) {
    storeUnsubscribe = store.subscribe(() => {
      if (conditionState?.disabled) return;
      const next = store.resolved();
      dispatchUpdate(next);
    });
  }
  if (!conditionState.disabled) {
    mount();
  }
  return {
    destroy() {
      storeUnsubscribe?.();
      storeUnsubscribe = null;
      conditionState?.cleanup();
      conditionState = null;
      unmount();
    },
    updateControls(values) {
      if (store) {
        store.set(values);
        return;
      }
      Object.assign(userValues, values);
      if (conditionState?.disabled) return;
      const next = resolveControls(experience, { controlValues: userValues });
      dispatchUpdate(next);
    }
  };
}
export {
  createExperience
};
