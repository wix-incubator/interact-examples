import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { getAgentState, recordRun } from './agent-state.js';

// Extract just the HTML document from a model response. Handles two kinds of
// stray wrapping: (1) a ```html … ``` fence, and (2) prose the model prepends
// or appends (e.g. "per the output contract, here it is:"). If the text
// contains an HTML document, everything before <!DOCTYPE html>/<html> and
// after the final </html> is dropped. A fragment without those markers is
// returned trimmed (after fence removal) unchanged.
export function extractHtml(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:html)?\s*\n([\s\S]*?)\n```/i);
  if (fence) t = fence[1].trim();
  const start = t.search(/<!doctype html>|<html[\s>]/i);
  if (start > 0) t = t.slice(start);
  const end = t.toLowerCase().lastIndexOf('</html>');
  if (end !== -1) t = t.slice(0, end + '</html>'.length);
  return t.trim();
}

// One-shot rewrite via the local `claude` CLI (reuses the machine's
// `claude login` — no API key). Uses stream-json so we can surface the
// model's reasoning/output live via the onDelta callback. The system prompt
// goes to a temp file (arg-size limits); the user prompt is piped on stdin.
// Tools are stripped via --exclude-dynamic-system-prompt-sections so it is a
// pure text-in / text-out call. Returns the assistant's final text.
//   onDelta(text, kind)  kind ∈ { 'text', 'thinking' } — called per token chunk.
export function runAgent(system, user, { model, onDelta, allowedTools, addDirs } = {}) {
  return new Promise((resolve, reject) => {
    (async () => {
      const dir = await mkdtemp(join(tmpdir(), 'iv-agent-'));
      const sysFile = join(dir, 'system.txt');
      await writeFile(sysFile, system, 'utf8');

      const args = ['-p', '--output-format', 'stream-json', '--include-partial-messages',
        '--verbose', '--system-prompt-file', sysFile, '--exclude-dynamic-system-prompt-sections'];
      if (allowedTools?.length) args.push('--allowedTools', allowedTools.join(','));
      for (const d of addDirs || []) args.push('--add-dir', d);
      const effModel = model || getAgentState().model;   // explicit > UI override > CLI default
      if (effModel) args.push('--model', effModel);

      const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '', resultText = null, resultErr = null, runModel = null;
      const rl = createInterface({ input: child.stdout });

      rl.on('line', (line) => {
        if (!line.trim()) return;
        let m; try { m = JSON.parse(line); } catch { return; }
        if (m.type === 'system' && m.subtype === 'init' && m.model) {
          runModel = m.model;                            // the model the CLI actually resolved
        } else if (m.type === 'stream_event' && m.event?.type === 'content_block_delta') {
          const d = m.event.delta;
          if (d?.type === 'text_delta' && d.text) onDelta?.(d.text, 'text');
          else if (d?.type === 'thinking_delta' && d.thinking) onDelta?.(d.thinking, 'thinking');
        } else if (m.type === 'result') {
          recordRun({ model: runModel, usage: m.usage });
          if (!m.is_error && typeof m.result === 'string') resultText = m.result;
          else resultErr = m.subtype || m.error || 'agent error';
        }
      });
      child.stderr.on('data', (c) => { stderr += c; });
      child.stdin.on('error', () => {}); // ignore EPIPE if the CLI exits early
      child.stdin.write(user); child.stdin.end();

      child.on('error', async (err) => { await rm(dir, { recursive: true, force: true }); reject(err); });
      child.on('close', async (code) => {
        await rm(dir, { recursive: true, force: true });
        if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`));
        if (resultErr) return reject(new Error(`claude error: ${resultErr}`));
        if (resultText === null) return reject(new Error('claude produced no result'));
        resolve(resultText);
      });
    })().catch(reject);
  });
}
