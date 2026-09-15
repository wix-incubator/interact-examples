import { INTERACT_CDN, PRESETS_CDN, LATEST_VERSION } from './constants.js';

export const FIX_OPTIONS = [
  { id: 'updateVersion', label: 'Update to latest version', default: true,
    fragment: `Pin EVERY @wix/interact import to the exact version ${LATEST_VERSION}. Any unversioned import (e.g. "https://esm.sh/@wix/interact") or older-version import MUST become exactly "${INTERACT_CDN}" — never leave an import unpinned. Named presets must import from "${PRESETS_CDN}". The final file must literally contain the string "@wix/interact@${LATEST_VERSION}". Migrate any version-specific syntax the new version requires.` },
  { id: 'migrateSyntax', label: 'Migrate old syntax', default: true,
    fragment: `Migrate outdated syntax to the current API: move play-mode off Interaction.params onto the effect and rename params.type -> triggerType (on TimeEffect) and params.method -> stateAction (on StateEffect); rename range-offset {value,type} -> {value,unit}; rename the custom element tag wix-interact-element -> interact-element; fix the useCutsomElement -> useCustomElement typo.` },
  { id: 'convertCustomEffect', label: 'Convert customEffect → preset/keyframe', default: false,
    fragment: `Where a customEffect merely maps to a known namedEffect (from @wix/motion-presets) or a keyframeEffect, replace it with that idiomatic effect. Only keep customEffect when the behavior genuinely requires per-frame DOM manipulation or randomness.` },
  { id: 'removeExtraJs', label: 'Remove extra JavaScript', default: false,
    fragment: `Remove hand-written JavaScript (manual addEventListener, IntersectionObserver, direct Element.animate, requestAnimationFrame/setInterval animation loops) and express the same behavior through @wix/interact triggers and effects instead.` },
  { id: 'convertToInteract', label: 'Convert non-interact → interact', default: false,
    fragment: `This file does not currently use @wix/interact. Rewrite it so the animation is driven by @wix/interact: import it from exactly "${INTERACT_CDN}" (pinned), wrap targets in <interact-element data-interact-key>, and call Interact.create once, preserving the original visual result.` },
];

const SYSTEM = (specText) => `You are an expert at the @wix/interact animation library. You rewrite standalone HTML animation files so they use @wix/interact correctly on the latest version.

Follow this canonical reference exactly:
${specText}

VERSION RULE: Whenever the file imports @wix/interact, pin it to exactly "${INTERACT_CDN}" (and "${PRESETS_CDN}" for presets). Never emit an unpinned @wix/interact import.

OUTPUT CONTRACT: Return ONLY the complete rewritten HTML file. No markdown code fences, no commentary, no explanation — just the raw HTML from <!DOCTYPE html> (or the file's first line) to its end. Preserve the original visual design, layout, copy, and asset URLs unless a requested fix requires changing them.`;

export function buildPrompt({ diagnosis, source, optionIds, customPrompt, specText }) {
  const chosen = FIX_OPTIONS.filter((o) => optionIds.includes(o.id));
  const fixList = chosen.length
    ? chosen.map((o) => `- ${o.label}: ${o.fragment}`).join('\n')
    : '- Apply only the custom instructions below.';
  const custom = customPrompt && customPrompt.trim()
    ? `\nCustom instructions (highest priority):\n${customPrompt.trim()}\n`
    : '';
  const user = `File: ${diagnosis.path}
Static diagnosis: ${JSON.stringify(diagnosis)}

Requested fixes:
${fixList}
${custom}
--- ORIGINAL SOURCE ---
${source}`;
  return { system: SYSTEM(specText), user };
}
