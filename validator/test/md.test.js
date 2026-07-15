import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdToHtml } from '../public/md.js';

test('renders headings and inline styles', () => {
  const h = mdToHtml('# Title\n\nsome **bold** and `code` here');
  assert.match(h, /<h1>Title<\/h1>/);
  assert.match(h, /<strong>bold<\/strong>/);
  assert.match(h, /<code>code<\/code>/);
});

test('renders a fenced code block with escaping', () => {
  const h = mdToHtml('```ts\nconst x = a < b;\n```');
  assert.match(h, /<pre class="md-code"><code>const x = a &lt; b;<\/code><\/pre>/);
});

test('renders a GFM pipe table', () => {
  const h = mdToHtml('| Role | Guidance |\n| --- | --- |\n| card | move it |');
  assert.match(h, /<table>/);
  assert.match(h, /<th>Role<\/th>/);
  assert.match(h, /<td>card<\/td>/);
  assert.match(h, /<td>move it<\/td>/);
});

test('renders unordered and ordered lists', () => {
  assert.match(mdToHtml('- a\n- b'), /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(mdToHtml('1. first\n2. second'), /<ol><li>first<\/li><li>second<\/li><\/ol>/);
});

test('wraps loose text in paragraphs and escapes html', () => {
  const h = mdToHtml('a <script> line');
  assert.match(h, /<p>a &lt;script&gt; line<\/p>/);
});
