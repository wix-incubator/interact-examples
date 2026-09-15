import { detect } from './detect.js';
import { buildPrompt } from './prompt.js';
import { writeDraft } from './drafts.js';
import { extractHtml, runAgent as realRunAgent } from './agent.js';
import { applyCodemods } from './codemod.js';

// Options whose work is inherently semantic — always require the agent.
const SEMANTIC_OPTIONS = ['convertCustomEffect', 'removeExtraJs', 'convertToInteract'];

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function fixFile(rootDir, relPath, opts) {
  const { source, optionIds = [], customPrompt, specText, model, onLog, runAgent = realRunAgent } = opts;
  try {
    // 1. Deterministic pass: pin version, rename tag/typo/offset-unit.
    const { output: codemodOut, applied } = applyCodemods(source, optionIds);

    // 2. Decide whether the agent is still needed. It is, if a semantic option
    //    is selected, a custom prompt was given, or "migrate old syntax" was
    //    requested and structural markers (params.type/method play-mode) remain
    //    after the deterministic pass.
    const hasCustom = !!(customPrompt && customPrompt.trim());
    const migrateResidual = optionIds.includes('migrateSyntax')
      && detect(relPath, codemodOut).oldSyntaxMarkers.length > 0;
    const needsAgent = hasCustom
      || optionIds.some((o) => SEMANTIC_OPTIONS.includes(o))
      || migrateResidual;

    let html, via;
    if (needsAgent) {
      const diagnosis = detect(relPath, codemodOut);
      const { system, user } = buildPrompt({ diagnosis, source: codemodOut, optionIds, customPrompt, specText });
      const onDelta = onLog ? (text, kind) => onLog(relPath, text, kind) : undefined;
      html = extractHtml(await runAgent(system, user, { model, onDelta }));
      via = 'agent';
    } else {
      html = codemodOut;
      via = 'script';
    }

    await writeDraft(rootDir, relPath, html);
    const recheck = detect(relPath, html);
    let clean = recheck.category === 'Clean & current'
      || (recheck.isLatest && recheck.oldSyntaxMarkers.length === 0);
    if (clean && optionIds.includes('convertCustomEffect') && recheck.usesCustomEffect) clean = false;
    if (clean && optionIds.includes('removeExtraJs') && recheck.usesExtraJs) clean = false;
    return { path: relPath, status: clean ? 'fixed' : 'needsReview', via, applied, recheck };
  } catch (err) {
    return { path: relPath, status: 'fixFailed', error: String(err.message || err) };
  }
}

export async function runFix(rootDir, files, opts) {
  const { concurrency = 4, onResult, ...rest } = opts;
  return mapLimit(files, concurrency, async (f) => {
    const result = await fixFile(rootDir, f.path, { ...rest, source: f.source });
    if (onResult) onResult(result);
    return result;
  });
}
