import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SKILL_DIR = join(homedir(), '.claude', 'skills', 'convert-interact-demo-example');

// Load the convert-interact-demo-example skill's instructions + bundled
// exemplar so a headless `claude -p` run can follow it without relying on
// dynamic skill auto-loading (which we strip for a clean text-in/text-out call).
export async function loadConvertSkill() {
  const skill = await readFile(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const exemplar = await readFile(join(SKILL_DIR, 'reference', 'example.guideline.md'), 'utf8').catch(() => '');
  return { skill, exemplar };
}
