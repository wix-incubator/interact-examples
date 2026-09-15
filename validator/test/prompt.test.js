// validator/test/prompt.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIX_OPTIONS, buildPrompt } from '../lib/prompt.js';

test('FIX_OPTIONS has expected ids and removeExtraJs defaults off', () => {
  const ids = FIX_OPTIONS.map((o) => o.id);
  assert.deepEqual(ids, ['updateVersion', 'migrateSyntax', 'convertCustomEffect', 'removeExtraJs', 'convertToInteract']);
  assert.equal(FIX_OPTIONS.find((o) => o.id === 'removeExtraJs').default, false);
  assert.equal(FIX_OPTIONS.find((o) => o.id === 'updateVersion').default, true);
});

test('buildPrompt embeds selected fragments, custom prompt, spec, and source', () => {
  const diagnosis = { path: 'A.html', version: '1.79.0', category: 'Outdated version', oldSyntaxMarkers: ['x'] };
  const { system, user } = buildPrompt({
    diagnosis, source: '<html>SRC</html>',
    optionIds: ['updateVersion', 'migrateSyntax'],
    customPrompt: 'keep the colors', specText: 'SPEC-RULES',
  });
  assert.match(system, /SPEC-RULES/);
  assert.match(system, /ONLY the complete rewritten HTML/i);
  assert.match(user, /2\.5\.1/);            // updateVersion fragment mentions target version
  assert.match(user, /triggerType|stateAction/); // migrateSyntax fragment mentions renames
  assert.match(user, /keep the colors/);
  assert.match(user, /SRC/);
  assert.match(user, /Outdated version/);   // diagnosis included
});

test('buildPrompt ignores unknown option ids and tolerates empty custom prompt', () => {
  const { user } = buildPrompt({
    diagnosis: { path: 'A.html', category: 'Clean & current', oldSyntaxMarkers: [] },
    source: 'x', optionIds: ['bogus'], customPrompt: '', specText: 's',
  });
  assert.doesNotMatch(user, /undefined/);
});
