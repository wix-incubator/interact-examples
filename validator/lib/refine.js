import { runAgent as realRunAgent } from './agent.js';

const SYSTEM = `You refine a GENERAL @wix/interact animation guideline based on holistic, cross-section feedback from a reviewer who applied it to several different sections.

RULES:
- The guideline must stay GENERAL and reusable across many sections. Do NOT overfit to any single generated output or section.
- Keep every section of the guideline intact and general (Summary, Selector Contract, Role Guidance, Adaptation Notes, Required Elements, Required Styles, Suggested Controls, Interact Template).
- Improve it to address the feedback at the pattern level — adjust roles, formulas, adaptation notes, controls, or the interact template as needed.
- When previous-iteration history is provided, address the CURRENT feedback without regressing what earlier iterations already fixed.

OUTPUT CONTRACT: Return ONLY the full updated guideline as raw markdown — no code fence around the whole document, no preamble, no commentary. Begin with the "# " H1.`;

function stripFence(text) {
  const t = String(text).trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return (m ? m[1] : t).trim();
}

export function buildRefinePrompt({ guideline, score, notes, history, userNotes }) {
  const historyPart = history ? `\nPrevious iterations:\n${history}\n` : '';
  const humanPart = userNotes ? `\nAdditional reviewer guidance (from the human):\n${userNotes}\n` : '';
  const user = `Reviewer score: ${score}/10

Reviewer notes (holistic, not specific to one output):
${notes || '(none)'}
${historyPart}${humanPart}
Current guideline to improve:
${guideline}`;
  return { system: SYSTEM, user };
}

export async function refineGuideline({ guideline, score, notes, history, userNotes, onDelta, model, runAgent = realRunAgent }) {
  const { system, user } = buildRefinePrompt({ guideline, score, notes, history, userNotes });
  return stripFence(await runAgent(system, user, { model, onDelta }));
}
