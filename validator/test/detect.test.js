// validator/test/detect.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../lib/detect.js';

const clean = `
<script type="module">
  import { Interact } from 'https://esm.sh/@wix/interact@2.5.1/web';
  Interact.create({ interactions: [{ key:'a', trigger:'hover',
    effects:[{ namedEffect:{ type:'FadeIn' }, duration:300, triggerType:'once' }] }] });
</script>
<interact-element data-interact-key="a"><div>x</div></interact-element>`;

test('clean current file', () => {
  const d = detect('X.html', clean);
  assert.equal(d.usesInteract, true);
  assert.equal(d.version, '2.5.1');
  assert.equal(d.isLatest, true);
  assert.equal(d.usesCustomEffect, false);
  assert.equal(d.usesExtraJs, false);
  assert.deepEqual(d.oldSyntaxMarkers, []);
  assert.equal(d.category, 'Clean & current');
});

test('outdated version', () => {
  const d = detect('Y.html', `import { Interact } from 'https://esm.sh/@wix/interact@1.79.0';`);
  assert.equal(d.usesInteract, true);
  assert.equal(d.version, '1.79.0');
  assert.equal(d.isLatest, false);
  assert.equal(d.category, 'Outdated version');
});

test('not using interact', () => {
  const d = detect('Z.html', `<script>console.log('hi')</script>`);
  assert.equal(d.usesInteract, false);
  assert.equal(d.version, null);
  assert.equal(d.category, 'Not using interact');
});

test('old syntax markers flag a latest-version file as outdated', () => {
  const src = `import {Interact} from 'https://esm.sh/@wix/interact@2.5.1/web';
    Interact.create({ interactions:[{ key:'a', trigger:'hover',
      params:{ method:'toggle' }, effects:[{ customEffect:()=>{} }] }] });
    <wix-interact-element data-interact-key="a"></wix-interact-element>`;
  const d = detect('W.html', src);
  assert.ok(d.oldSyntaxMarkers.some((m) => m.includes('wix-interact-element')));
  assert.ok(d.oldSyntaxMarkers.some((m) => m.includes('method')));
  assert.equal(d.category, 'Outdated version');
});

test('extra js detection', () => {
  const src = `import {Interact} from 'https://esm.sh/@wix/interact@2.5.1/web';
    window.addEventListener('scroll', () => {});
    new IntersectionObserver(() => {});
    el.animate([], 300);`;
  const d = detect('V.html', src);
  assert.equal(d.usesExtraJs, true);
  assert.ok(d.extraJsSignals.includes('addEventListener(scroll)'));
  assert.ok(d.extraJsSignals.includes('IntersectionObserver'));
  assert.ok(d.extraJsSignals.includes('Element.animate()'));
  assert.equal(d.category, 'Uses extra JS');
});

test('customEffect on a latest, no-extra-js file', () => {
  const src = `import {Interact} from 'https://esm.sh/@wix/interact@2.5.1/web';
    Interact.create({ interactions:[{ key:'a', trigger:'pointerMove',
      effects:[{ customEffect:(el,p)=>{} }] }] });`;
  const d = detect('U.html', src);
  assert.equal(d.usesCustomEffect, true);
  assert.equal(d.usesExtraJs, false);
  assert.equal(d.category, 'Uses customEffect');
});
