// Injects a <base href> so relative asset URLs in a previewed animation
// resolve against its original directory (same technique explorer.html uses).
export function injectBase(html, baseHref) {
  if (/<base\s/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${baseHref}">`);
  }
  return `<base href="${baseHref}">\n${html}`;
}
