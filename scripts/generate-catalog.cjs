#!/usr/bin/env node
/* eslint-disable */
// One-shot generator: drives a running dev server with Playwright,
// runs each example through the Manifold/OpenSCAD engine to capture a
// thumbnail, then writes the resulting `.partwright.json` files plus a
// `manifest.json` into `public/catalog/`.
//
// Usage:
//   1. `npm run dev` in another terminal (defaults to http://localhost:5173/)
//   2. `node scripts/generate-catalog.cjs [BASE_URL]`
//
// Re-run any time the example files change.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');
const CATALOG_DIR = path.join(REPO_ROOT, 'public', 'catalog');
const BASE_URL = process.argv[2] || 'http://localhost:5173';

// Ordered manifest. Keep this list in sync with examples/ when adding new ones.
const ENTRIES = [
  { id: 'twisted-vase',     name: 'Twisted Vase',     file: 'twisted_vase.partwright.json',     language: 'manifold-js', source: 'twisted_vase.js',     description: 'Stacked rotated rings forming a hex-faceted twisted profile.' },
  { id: 'christmas-tree',   name: 'Christmas Tree',   file: 'christmas_tree.partwright.json',   language: 'manifold-js', source: 'christmas_tree.js',   description: 'Low-poly tiered tree with a stellated octahedron star on top.' },
  { id: 'chess-rook',       name: 'Chess Rook',       file: 'chess_rook.partwright.json',       language: 'manifold-js', source: 'chess_rook.js',       description: 'Hollow chess rook with crenellations cut from the parapet.' },
  { id: 'openscad-twisted', name: 'OpenSCAD: Twisted', file: 'openscad_twisted.partwright.json', language: 'scad',         source: 'openscad_twisted.scad', description: 'Twisted star column via OpenSCAD\'s linear_extrude.' },
];

async function main() {
  if (!fs.existsSync(CATALOG_DIR)) fs.mkdirSync(CATALOG_DIR, { recursive: true });

  // Headed Chromium with hardware-accelerated WebGL — Three.js needs a real
  // GL context to render. Headless+SwiftShader fails on this codebase.
  const browser = await chromium.launch({
    headless: false,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  page error:', msg.text());
  });

  console.log(`→ ${BASE_URL}/editor`);
  await page.goto(`${BASE_URL}/editor`, { waitUntil: 'networkidle' });

  // Wait for partwright API to be ready.
  await page.waitForFunction(() => !!(window.partwright && window.partwright.runAndSave), null, { timeout: 30000 });

  for (const entry of ENTRIES) {
    const code = fs.readFileSync(path.join(EXAMPLES_DIR, entry.source), 'utf8');
    process.stdout.write(`  ${entry.name.padEnd(20)} `);

    let result;
    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      // Always start each attempt from a fresh /editor page to avoid stale state.
      try {
        await page.goto(`${BASE_URL}/editor`, { waitUntil: 'domcontentloaded' });
      } catch {
        // Tolerate intermediate redirects (e.g. session-id replaceState during init).
      }
      try {
        await page.waitForFunction(() => !!(window.partwright && window.partwright.runAndSave), null, { timeout: 30000 });
      } catch {
        result = { error: 'API never appeared', where: 'init' };
        continue;
      }

      try {
        result = await page.evaluate(async ({ entry, code }) => {
          if (window.partwright.getActiveLanguage() !== entry.language) {
            await window.partwright.setActiveLanguage(entry.language);
          }
          // Probe with a trivial program to make sure the engine is fully
          // warmed up before the real run — language switches load WASM
          // lazily (the OpenSCAD bundle is ~11 MB) and runAndSave no-ops
          // until the loader resolves.
          const probe = entry.language === 'scad'
            ? 'cube([1, 1, 1], center=true);'
            : 'return api.Manifold.cube([1, 1, 1], true);';
          let warmed = false;
          for (let i = 0; i < 60; i++) {
            const p = await window.partwright.runAndSave(probe, 'probe', {});
            if (p && !p.error && p.version) { warmed = true; break; }
            await new Promise((r) => setTimeout(r, 1000));
          }
          if (!warmed) return { error: 'engine warmup timeout', where: 'warmup' };
          await window.partwright.createSession(entry.name);
          const r = await window.partwright.runAndSave(code, 'v0', { isManifold: true });
          if (r && r.error) return { error: r.error, where: 'runAndSave' };
          if (!r || !r.version) return { error: 'no version saved: ' + JSON.stringify(r).slice(0, 400), where: 'runAndSave' };
          const data = await window.partwright.exportSession(undefined, { includeThumbnails: true });
          if (data && data.error) return { error: data.error, where: 'export' };
          return { ok: true, data };
        }, { entry, code });
        break;
      } catch (e) {
        if (attempt >= 3) {
          result = { error: String(e), where: 'eval' };
          break;
        }
      }
    }

    if (!result.ok) {
      console.log(`✘ ${result.where}: ${result.error}`);
      continue;
    }

    const filePath = path.join(CATALOG_DIR, entry.file);
    fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2) + '\n');
    const sizeKb = (fs.statSync(filePath).size / 1024).toFixed(0);
    console.log(`✔  ${sizeKb} KB`);
  }

  // Write manifest. Strip internal `source` field — only id/name/description/file/language ship.
  const manifest = {
    entries: ENTRIES.map(({ source: _omit, ...rest }) => rest),
  };
  fs.writeFileSync(path.join(CATALOG_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✔  manifest.json (${manifest.entries.length} entries)`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
