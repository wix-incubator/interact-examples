// Build a self-contained HTML document that renders a section. With a generated
// @wix/interact-experience config, the vendored renderer wires the animation
// onto the injected markup. With NO config (null/empty), the section is shown
// statically — its original layout, before any guideline is applied. The config
// is embedded as a JSON string in a data attribute (script-tag-safe).
export function buildRenderDoc({ html, css, config }) {
  const hasConfig = config !== null && config !== undefined && String(config).trim() !== '';
  // Neutralize any </script end-tag the HTML tokenizer would recognize —
  // the closing "script" name can be followed by whitespace, "/", or ">".
  const safeConfig = hasConfig ? String(config).replace(/<\/script(?=[\s/>])/gi, '<\\/script') : '';
  const animate = hasConfig ? `
<script type="application/json" id="__config">${safeConfig}</script>
<script type="module">
  import { createExperience } from '/vendor/render-runtime.js';
  try {
    const config = JSON.parse(document.getElementById('__config').textContent);
    createExperience(config, { root: document.getElementById('__root') });
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin',
      '<pre style="color:#b00;font:12px monospace;padding:8px;white-space:pre-wrap">render error: ' + (e && e.message || e) + '</pre>');
  }
</script>` : '';
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0}${css || ''}</style></head>
<body>
<div id="__root">${html || ''}</div>${animate}
</body></html>`;
}
