// validator/test/preview.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectBase } from '../public/preview.js';

test('injectBase inserts a base tag after <head>', () => {
  const out = injectBase('<html><head>\n<title>x</title></head></html>', '/G/');
  assert.match(out, /<head>\s*\n<base href="\/G\/">/);
});
test('injectBase prepends when no head', () => {
  assert.match(injectBase('<div>x</div>', '/G/'), /^<base href="\/G\/">/);
});
test('injectBase leaves an existing base alone', () => {
  const html = '<head><base href="/orig/"></head>';
  assert.equal(injectBase(html, '/G/'), html);
});
