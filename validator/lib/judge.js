// validator/lib/judge.js — one fresh vision call per iteration: reads the
// original example's frames + each generated section's frames and returns a
// strict-JSON verdict. Isolation: every call is a new claude subprocess.
import { runAgent as realRunAgent } from './agent.js';

const SYSTEM = `You are a strict animation reviewer for @wix/interact guidelines. You compare an ORIGINAL animation example against GENERATED results produced by applying a prose guideline to different website sections.

Grade on exactly two axes:
1. PATTERN FIDELITY — do the generated animations express the SAME MOTION PATTERN as the original (direction, stagger, easing feel, scroll-range pacing — e.g. the animation must span the full scroll range, not finish prematurely), adapted sensibly to each section's own elements? The RIGHT elements must move (e.g. images/cards as the visual subject — not stray text or buttons).
2. INTEGRITY — is each section's layout intact? Nothing clipped, missing, overlapping, or invisible; every element that existed still renders.

The sections have DIFFERENT content and layout than the original BY DESIGN. Content differences are expected and must NOT be penalized. You are shown scroll-sweep screenshots; triggers other than scroll (hover, click) cannot appear in them — do not penalize what frames cannot show.

Read the screenshot files you are given (Read tool) before scoring. Score 1-10 where 8 means "ship it".

OUTPUT CONTRACT: reply with ONLY a JSON object, no fence, no prose:
{"score": <1-10>, "notes": "<holistic, pattern-level feedback for improving the guideline>", "sections": [{"id": "<section id>", "issues": ["<specific problem>", ...]}]}`;

export function buildJudgePrompt({ guideline, exampleSource, exampleTriggers, originalFrames, sections }) {
  const secBlocks = sections.map((s) => s.error
    ? `### Section "${s.id}"\nGENERATION FAILED: ${s.error} (score integrity accordingly)`
    : `### Section "${s.id}"\nFrames (read these):\n${s.frames.map((f) => `- ${f}`).join('\n')}\nGenerated config:\n${s.config}`
  ).join('\n\n');
  const user = `## The guideline under test
${guideline}

## Original example
Triggers used: ${exampleTriggers.join(', ') || 'unknown'}
Source code:
\`\`\`html
${exampleSource}
\`\`\`
Frames of the original (read these):
${originalFrames.map((f) => `- ${f}`).join('\n')}

## Generated results
${secBlocks}

Read all frame files, then reply with the JSON verdict only.`;
  return { system: SYSTEM, user };
}

export function parseJudgeOutput(text) {
  let t = String(text).trim();
  const m = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  if (m) t = m[1].trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('judge output: could not parse JSON (no object found)');
  let obj;
  try { obj = JSON.parse(t.slice(start, end + 1)); }
  catch (e) { throw new Error(`judge output: could not parse JSON (${e.message})`); }
  if (typeof obj.score !== 'number' || obj.score < 1 || obj.score > 10)
    throw new Error('judge output: score must be a number 1-10');
  return { score: obj.score, notes: String(obj.notes || ''), sections: Array.isArray(obj.sections) ? obj.sections : [] };
}

export async function judgeIteration(inputs, { runAgent = realRunAgent, addDir, onDelta, model } = {}) {
  const { system, user } = buildJudgePrompt(inputs);
  const opts = { model, onDelta, allowedTools: ['Read'], addDirs: addDir ? [addDir] : [] };
  try {
    return parseJudgeOutput(await runAgent(system, user, opts));
  } catch (err) {
    const retryUser = `${user}\n\nYour previous reply was not valid: ${err.message}. Reply with ONLY the JSON object.`;
    return parseJudgeOutput(await runAgent(system, retryUser, opts));
  }
}
