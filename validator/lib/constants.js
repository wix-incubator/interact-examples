import { homedir } from 'node:os';
import { join } from 'node:path';

export const LATEST_VERSION = '2.5.1';
// The /web subpath is required — it exports the <interact-element> custom element.
export const INTERACT_CDN = `https://esm.sh/@wix/interact@${LATEST_VERSION}/web`;
export const PRESETS_CDN = 'https://esm.sh/@wix/motion-presets';
export const DRAFTS_DIR = '.drafts';
// Generated prose guidelines ("convert to prompt" output) live here.
export const PROMPTS_DIR = 'Ani-Mate Prompts';

// Directories never scanned for animation files.
export const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.drafts', '.backups',
  'analysis', 'explorer-screenshots', 'docs', 'validator', '.cursor',
  PROMPTS_DIR,
]);

// Files at any level that are not animations.
export const IGNORED_FILES = new Set(['explorer.html']);

export const PLAYGROUND_REPO = process.env.PLAYGROUND_REPO || join(homedir(), 'Documents/Dev/Wix/interact-xp');
export const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'http://localhost:5173';
export const SECTION_INSTRUCTION =
  'Apply the animation pattern described in the example to this section. Follow its Selector Contract and Interact Template, adapting the roles to this section’s DOM. Return only the experience config.';
