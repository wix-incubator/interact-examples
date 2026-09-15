// validator/test/agent.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHtml } from '../lib/agent.js';

test('extractHtml strips html code fences', () => {
  assert.equal(extractHtml('```html\n<div>x</div>\n```'), '<div>x</div>');
});
test('extractHtml strips bare fences', () => {
  assert.equal(extractHtml('```\n<div>x</div>\n```'), '<div>x</div>');
});
test('extractHtml passes through plain html', () => {
  assert.equal(extractHtml('<!DOCTYPE html>\n<html></html>'), '<!DOCTYPE html>\n<html></html>');
});
test('extractHtml extracts fenced block when prose precedes it', () => {
  assert.equal(extractHtml('Here:\n```html\n<div>x</div>\n```'), '<div>x</div>');
});
test('extractHtml returns trimmed text unchanged when no fence present', () => {
  assert.equal(extractHtml('no fence here'), 'no fence here');
});
test('extractHtml drops prose the model prepends before the document', () => {
  const out = extractHtml("Per the output contract, here it is:\n\n<!DOCTYPE html>\n<html><body>x</body></html>");
  assert.equal(out, '<!DOCTYPE html>\n<html><body>x</body></html>');
});
test('extractHtml drops trailing prose after </html>', () => {
  const out = extractHtml('<!DOCTYPE html>\n<html></html>\n\nLet me know if you want changes!');
  assert.equal(out, '<!DOCTYPE html>\n<html></html>');
});
test('extractHtml handles prose + fence + prose together', () => {
  const out = extractHtml("Sure:\n```html\nnote\n<!DOCTYPE html>\n<html></html>\nthanks\n```");
  assert.equal(out, '<!DOCTYPE html>\n<html></html>');
});
test('extractHtml clamps to <html> when there is no doctype', () => {
  const out = extractHtml('Here you go:\n<html lang="en"><body>y</body></html> — done');
  assert.equal(out, '<html lang="en"><body>y</body></html>');
});
