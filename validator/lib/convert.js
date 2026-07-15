import { mapLimit } from './fix.js';
import { runAgent as realRunAgent } from './agent.js';
import { writePrompt } from './prompts.js';

// Assemble the system+user prompt that runs the convert-interact-demo-example
// skill headlessly: the skill instructions and exemplar go in the system
// prompt; the demo source is the user message.
export function buildConvertPrompt({ skill, exemplar, relPath, source }) {
  const system = `You are executing the "convert-interact-demo-example" skill. Follow its instructions exactly to turn a @wix/interact demo into a structured prose guideline.

=== SKILL INSTRUCTIONS ===
${skill}

=== REFERENCE EXEMPLAR (match this structure exactly) ===
${exemplar}

OUTPUT CONTRACT: Return ONLY the finished guideline as raw markdown. Do NOT wrap the whole document in a code fence, and do NOT add any preamble or closing remarks. Begin with the "# <Name>" H1 line.`;
  const user = `Convert this @wix/interact demo into the guideline. Source file: ${relPath}\n\n${source}`;
  return { system, user };
}

// The model occasionally wraps the whole doc in a ```markdown fence — strip it.
function stripMarkdownFence(text) {
  const t = String(text).trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return (m ? m[1] : t).trim();
}

export async function convertFile(rootDir, relPath, opts) {
  const { source, skill, exemplar, model, onLog, runAgent = realRunAgent } = opts;
  try {
    const { system, user } = buildConvertPrompt({ skill, exemplar, relPath, source });
    const onDelta = onLog ? (text) => onLog(relPath, text) : undefined;
    const md = stripMarkdownFence(await runAgent(system, user, { model, onDelta }));
    const outPath = await writePrompt(rootDir, relPath, md);
    return { path: relPath, status: 'converted', via: 'agent', outPath };
  } catch (err) {
    return { path: relPath, status: 'failed', error: String(err.message || err) };
  }
}

export async function runConvert(rootDir, files, opts) {
  const { concurrency = 4, onResult, ...rest } = opts;
  return mapLimit(files, concurrency, async (f) => {
    const result = await convertFile(rootDir, f.path, { ...rest, source: f.source });
    if (onResult) onResult(result);
    return result;
  });
}
