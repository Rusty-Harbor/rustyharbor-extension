#!/usr/bin/env node
// Builds the RustyHarbor extension for Firefox and Chrome from the
// same source code.

import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const targetArg = args.find(a => a.startsWith('--target='));
const targets = targetArg
  ? [targetArg.split('=')[1]]
  : ['firefox', 'chrome'];

const validTargets = new Set(['firefox', 'chrome']);
for (const t of targets) {
  if (!validTargets.has(t)) {
    console.error(`Unknown target: ${t}. Must be firefox or chrome.`);
    process.exit(1);
  }
}

const entryPoints = {
  'background': 'src/background.ts',
  'content/steam': 'src/content/steam.ts',
  'content/site': 'src/content/site.ts',
  'popup/popup': 'src/popup/popup.ts',
  'offscreen': 'src/offscreen.ts',
};

for (const target of targets) {
  const outdir = join(root, 'dist', target);
  console.log(`\n[build] target=${target} output=${outdir}`);

  if (existsSync(outdir)) rmSync(outdir, { recursive: true });
  mkdirSync(outdir, { recursive: true });

  const isFirefox = target === 'firefox';
  await build({
    entryPoints,
    outdir,
    bundle: true,
    format: isFirefox ? 'iife' : 'esm',
    target: 'es2022',
    platform: 'browser',
    sourcemap: 'inline',
    logLevel: 'info',
    loader: { '.json': 'json' },
  });

  const manifestSrc = join(root, `manifest.${target}.json`);
  const manifestDst = join(outdir, 'manifest.json');
  cpSync(manifestSrc, manifestDst);

  // Inline the popup CSS into the popup HTML at build time. Firefox
  // forces popup layout before async <link> stylesheets resolve, which
  // produced a tiny-white-square popup. Inlining sidesteps the race.
  const popupHtml = readFileSync(join(root, 'src/popup/index.html'), 'utf-8');
  const popupCss = readFileSync(join(root, 'src/popup/popup.css'), 'utf-8');
  const inlinedPopupHtml = popupHtml.replace(
    /<link[^>]+href="popup\.css"[^>]*\/?>/,
    `<style>\n${popupCss}\n</style>`,
  );
  mkdirSync(join(outdir, 'popup'), { recursive: true });
  writeFileSync(join(outdir, 'popup/index.html'), inlinedPopupHtml);

  // Firefox uses background.html (with our own DOCTYPE) instead of
  // the auto-generated background page; Chrome ignores this file
  // since it loads background.js via service_worker manifest entry.
  cpSync(join(root, 'src/background.html'), join(outdir, 'background.html'));

  // Offscreen document (Chrome audio playback). Firefox ignores it.
  cpSync(join(root, 'src/offscreen.html'), join(outdir, 'offscreen.html'));

  cpSync(join(root, 'public/icons'), join(outdir, 'icons'), { recursive: true });

  // Bundled static assets (e.g. the order-alert sound). Optional — the
  // dir may not exist yet (sound asset added later); copy if present.
  const assetsSrc = join(root, 'public/assets');
  if (existsSync(assetsSrc)) {
    cpSync(assetsSrc, join(outdir, 'assets'), { recursive: true });
  }

  let commit = 'dev';
  try {
    const { execSync } = await import('node:child_process');
    commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
  } catch {}
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
  writeFileSync(join(outdir, 'build-info.json'), JSON.stringify({
    version: pkg.version,
    commit,
    target,
    builtAt: new Date().toISOString(),
  }, null, 2));

  console.log(`[build] ${target} ready. commit=${commit}`);
}

console.log('\n[build] done.');
