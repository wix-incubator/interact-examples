import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadSpecText(rootDir) {
  try {
    return await readFile(join(rootDir, 'full-lean.md'), 'utf8');
  } catch {
    return 'Use @wix/interact 2.4.0. Tag: <interact-element data-interact-key>. '
      + 'Effects: namedEffect | keyframeEffect | customEffect. '
      + 'Play-mode: triggerType (TimeEffect) / stateAction (StateEffect).';
  }
}
