// validator/scripts/build-vendor.mjs
import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const XP = process.env.PLAYGROUND_REPO || join(homedir(), 'Documents/Dev/Wix/interact-xp');
const OUT = new URL('../vendor/', import.meta.url).pathname;

// `@wix/interact-experience`'s package.json `exports` points at a `dist/`
// that is never built in this checkout (it's a workspace-only, source-only
// package here). The interact-xp Vite configs work around this with a
// resolve alias pointing straight at the package's `src/index.ts` — mirror
// that alias here so esbuild resolves the same way the real build does.
const INTERACT_EXPERIENCE_ALIAS = join(XP, 'packages/interact-experience/src/index.ts');

async function buildRenderRuntime() {
  await build({
    entryPoints: [join(XP, 'packages/interact-experience-renderer/src/index.ts')],
    bundle: true, format: 'esm', platform: 'browser',
    outfile: join(OUT, 'render-runtime.js'),
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { '@wix/interact-experience': INTERACT_EXPERIENCE_ALIAS },
    conditions: ['module', 'import', 'default'],
    logLevel: 'info',
  });
  console.log('✓ render-runtime.js');
}

async function emitSchema() {
  const tmp = join(tmpdir(), `iv-schema-${process.pid}.mjs`);
  await build({
    entryPoints: [join(XP, 'apps/playground/src/lib/schema.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: tmp,
    alias: { '@wix/interact-experience': INTERACT_EXPERIENCE_ALIAS },
    conditions: ['module', 'import', 'default'],
    logLevel: 'info',
  });
  const mod = await import(pathToFileURL(tmp).href);
  await writeFile(join(OUT, 'experience.schema.json'), JSON.stringify(mod.EXPERIENCE_SCHEMA, null, 2));
  await rm(tmp, { force: true });
  console.log('✓ experience.schema.json');
}

await mkdir(OUT, { recursive: true });
await buildRenderRuntime();
await emitSchema();
console.log('vendor build complete');
