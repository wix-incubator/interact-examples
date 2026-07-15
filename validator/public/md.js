// Minimal, dependency-free Markdown → HTML renderer. Supports the constructs
// the convert-interact guideline uses: headings, fenced code, GFM pipe tables,
// unordered/ordered lists, hr, paragraphs, and inline code/bold/italic/links.
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

const isTableSep = (l) => /^\s*\|?[\s:-]*-{2,}[\s:|-]*\|?\s*$/.test(l) && l.includes('-');

export function mdToHtml(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  let html = '', i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      i++; let code = '';
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code += lines[i] + '\n'; i++; }
      i++;
      html += `<pre class="md-code"><code>${esc(code.replace(/\n$/, ''))}</code></pre>`;
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const n = h[1].length; html += `<h${n}>${inline(h[2])}</h${n}>`; i++; continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { html += '<hr>'; i++; continue; }
    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const parseRow = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const headers = parseRow(l); i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(parseRow(lines[i])); i++; }
      html += '<table><thead><tr>' + headers.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
      continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      html += '<ul>' + items.map((it) => `<li>${inline(it)}</li>`).join('') + '</ul>';
      continue;
    }
    if (/^\s*\d+\.\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      html += '<ol>' + items.map((it) => `<li>${inline(it)}</li>`).join('') + '</ol>';
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim()
      && !/^\s*(#{1,6}\s|```|[-*]\s|\d+\.\s)/.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      para.push(lines[i]); i++;
    }
    html += `<p>${inline(para.join(' '))}</p>`;
  }
  return html;
}
