import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLAYGROUND_REPO, PLAYGROUND_URL, SECTION_INSTRUCTION } from './constants.js';
import { getAgentState } from './agent-state.js';

const SECTIONS_DIR = join(PLAYGROUND_REPO, 'apps/playground/src/sections');
const PROMPT_DIST = join(PLAYGROUND_REPO, 'packages/interact-experience-prompt/dist/es/index.js');
const SCHEMA_PATH = new URL('../vendor/experience.schema.json', import.meta.url);

// Pure: given the playground's buildGenerate + schema, produce the request body.
export function assemblePayload({ buildGenerate, schema, html, css, guideline }) {
  const prompt = buildGenerate({ html, css, userPrompt: SECTION_INSTRUCTION, userPromptExample: guideline, schema });
  return { user_input: prompt.user, system_rules: prompt.system };
}

export async function listSections(sectionsDir = SECTIONS_DIR) {
  let entries;
  try { entries = await readdir(sectionsDir, { withFileTypes: true }); }
  catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(sectionsDir, e.name);
    const read = async (f) => { try { return await readFile(join(dir, f), 'utf8'); } catch { return null; } };
    // `html` is the real section markup (what we RENDER); `promptHtml` is the
    // injection-safe sanitized copy (what the MODEL sees, mirroring the
    // playground app itself). Same DOM shape, so generated selectors match.
    const raw = await read('section.html');
    const sanitized = await read('section.sanitized.html');
    const html = raw ?? sanitized;
    if (html === null) continue;
    out.push({ id: e.name, html, promptHtml: sanitized ?? html, css: (await read('section.css')) ?? '' });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function loadBuildGenerate() {
  const mod = await import(pathToFileURL(PROMPT_DIST).href);
  return mod.buildGenerate;
}
async function loadSchema() {
  return JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
}

export async function buildPayload({ html, css, guideline }) {
  const [buildGenerate, schema] = await Promise.all([loadBuildGenerate(), loadSchema()]);
  return assemblePayload({ buildGenerate, schema, html, css, guideline });
}

export async function generate({ html, css, guideline },
  { playgroundUrl = PLAYGROUND_URL, fetchImpl = fetch, buildGenerateImpl, schemaImpl } = {}) {
  const buildGenerate = buildGenerateImpl || (await loadBuildGenerate());
  const schema = schemaImpl || (await loadSchema());
  const body = assemblePayload({ buildGenerate, schema, html, css, guideline });
  // Honor the UI's model override — the playground's local-agent middleware
  // accepts { provider, model } alongside the prompt fields.
  const override = getAgentState().model;
  if (override) { body.provider = 'claude'; body.model = override; }
  const res = await fetchImpl(`${playgroundUrl}/api/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`playground /api/generate returned ${res.status}`);
  const data = await res.json();
  return { config: data.config, sessionId: data.sessionId };
}

export async function pingStatus({ playgroundUrl = PLAYGROUND_URL, fetchImpl = fetch } = {}) {
  try { const res = await fetchImpl(playgroundUrl, { method: 'GET' }); return !!res && (res.ok || res.status < 500); }
  catch { return false; }
}
