import { readPrompt, writePromptRaw } from './prompts.js';

const historyRel = (promptRel) => `${promptRel}.history.json`;

export async function readLoop(rootDir, promptRel) {
  const raw = await readPrompt(rootDir, historyRel(promptRel));
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      return { working: parsed.working, rounds: parsed.rounds || [] };
    } catch { /* fall through to defaults */ }
  }
  const md = await readPrompt(rootDir, promptRel);
  return { working: md ?? '', rounds: [] };
}

async function save(rootDir, promptRel, loop) {
  await writePromptRaw(rootDir, historyRel(promptRel), JSON.stringify(loop, null, 2));
}

// A round stores both the guideline it RAN with (`guideline`) and the
// guideline its refine PRODUCED (`refined` = newWorking) — so a later
// rollback can never destroy a refined version.
export async function recordRound(rootDir, promptRel, { guideline, sections, score, notes, newWorking }) {
  const loop = await readLoop(rootDir, promptRel);
  const round = loop.rounds.length + 1;
  loop.rounds.push({ round, guideline, refined: newWorking, sections: sections || [], score, notes });
  loop.working = newWorking;
  await save(rootDir, promptRel, loop);
  return { round };
}

// The guideline a round produced. Older histories predate `refined`; fall
// back to the next round's input (what working was when it ran), else working.
export function roundRefined(loop, round) {
  const r = loop.rounds.find((x) => x.round === round);
  if (!r) return null;
  if (typeof r.refined === 'string') return r.refined;
  const next = loop.rounds.find((x) => x.round === round + 1);
  return next ? next.guideline : loop.working;
}

export async function rollback(rootDir, promptRel, round) {
  const loop = await readLoop(rootDir, promptRel);
  const target = loop.rounds.find((r) => r.round === round);
  if (!target) throw new Error(`no round ${round}`);
  loop.working = target.guideline;
  await save(rootDir, promptRel, loop);
  return { working: loop.working };
}

export async function finalize(rootDir, promptRel) {
  const loop = await readLoop(rootDir, promptRel);
  await writePromptRaw(rootDir, promptRel, loop.working);
}
