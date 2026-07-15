import { LATEST_VERSION } from './constants.js';

const EXTRA_JS_PATTERNS = [
  { re: /addEventListener\(\s*['"`](scroll|wheel|mousemove|pointermove|pointerdown|touchmove)['"`]/g,
    label: (m) => `addEventListener(${m[1]})` },
  { re: /\bIntersectionObserver\b/, label: () => 'IntersectionObserver' },
  { re: /\.animate\s*\(/, label: () => 'Element.animate()' },
  { re: /\brequestAnimationFrame\b/, label: () => 'requestAnimationFrame loop' },
  { re: /\bsetInterval\b/, label: () => 'setInterval loop' },
];

function findExtraJs(source) {
  const signals = [];
  for (const { re, label } of EXTRA_JS_PATTERNS) {
    const r = new RegExp(re.source, re.flags);
    if (r.global) {
      let m;
      while ((m = r.exec(source)) !== null) {
        const s = label(m);
        if (!signals.includes(s)) signals.push(s);
      }
    } else if (r.test(source)) {
      signals.push(label());
    }
  }
  return signals;
}

function findOldSyntaxMarkers(source) {
  const markers = [];
  if (/wix-interact-element/.test(source)) markers.push('wix-interact-element tag (use interact-element)');
  if (/data-wix-path/.test(source)) markers.push('data-wix-path attribute (use data-interact-key)');
  if (/\bmethod\s*:/.test(source)) markers.push('params.method (use stateAction on the effect)');
  if (/\btype\s*:\s*['"`](once|repeat|alternate|state)['"`]/.test(source)) markers.push('params.type play-mode (use triggerType on the effect)');
  if (/\btype\s*:\s*['"`](percentage|px|vh|vw|vmin|vmax|em|rem)['"`]/.test(source)) markers.push('range offset {value,type} (use unit)');
  if (/useCutsomElement/.test(source)) markers.push('useCutsomElement typo (use useCustomElement)');
  return markers;
}

export function detect(filePath, source) {
  const usesInteract = /@wix\/interact/.test(source);
  const versionMatch = source.match(/@wix\/interact@(\d+\.\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : null;
  const isLatest = version === LATEST_VERSION;
  const usesCustomEffect = /customEffect\s*:/.test(source);
  const extraJsSignals = findExtraJs(source);
  const usesExtraJs = extraJsSignals.length > 0;
  const oldSyntaxMarkers = findOldSyntaxMarkers(source);

  let category;
  if (!usesInteract) category = 'Not using interact';
  else if (!isLatest || oldSyntaxMarkers.length > 0) category = 'Outdated version';
  else if (usesExtraJs) category = 'Uses extra JS';
  else if (usesCustomEffect) category = 'Uses customEffect';
  else category = 'Clean & current';

  return { path: filePath, usesInteract, version, isLatest, usesCustomEffect,
    usesExtraJs, extraJsSignals, oldSyntaxMarkers, category };
}
