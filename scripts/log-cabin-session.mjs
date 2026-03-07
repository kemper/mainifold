// Creates a "Log Cabin" session with 4 versions of increasing detail.
// Run: node scripts/log-cabin-session.mjs

import puppeteer from 'puppeteer';

const VERSIONS = [
  {
    label: 'v1 - cabin silhouette',
    code: `
const { Manifold, CrossSection } = api;

const W = 40, D = 30, H = 18;
const roofH = 14, ov = 3;

// Solid cabin box
const cabin = Manifold.cube([W, D, H]);

// Peaked roof — triangle extruded along depth
const roofProfile = CrossSection.ofPolygons([
  [[-ov, 0], [W + ov, 0], [W / 2, roofH]]
]);
const roof = roofProfile.extrude(D + 2 * ov)
  .rotate([90, 0, 0])
  .translate([0, D + ov, H]);

return Manifold.union([cabin, roof]);
`,
  },
  {
    label: 'v2 - log walls',
    code: `
const { Manifold, CrossSection } = api;

const W = 40, D = 30, H = 18;
const roofH = 14, ov = 3, roofT = 0.8;
const logR = 1.0, logSegs = 8, cExt = 2.5;
const logD = 2 * logR;
const numRows = Math.floor(H / logD);

// --- Log helpers ---
function xLog(len, y, z) {
  return Manifold.cylinder(len, logR, logR, logSegs)
    .rotate([0, 90, 0]).translate([-cExt, y, z]);
}
function yLog(len, x, z) {
  return Manifold.cylinder(len, logR, logR, logSegs)
    .rotate([-90, 0, 0]).translate([x, -cExt, z]);
}

// --- Wall logs (all 4 walls, every row) ---
const parts = [];
for (let i = 0; i < numRows; i++) {
  const z = logR + i * logD;
  parts.push(xLog(W + 2 * cExt, logR, z));         // front
  parts.push(xLog(W + 2 * cExt, D - logR, z));      // back
  parts.push(yLog(D + 2 * cExt, logR, z));           // left
  parts.push(yLog(D + 2 * cExt, W - logR, z));       // right
}

// --- Gable logs (front & back triangles) ---
for (let j = 0; j < 20; j++) {
  const z = H + logR + j * logD;
  const t = (z - H) / roofH;
  if (t > 0.85) break;
  const gW = (W - 4 * logR) * (1 - t);
  if (gW < logD * 3) break;
  const xOff = (W - gW) / 2;
  const g = Manifold.cylinder(gW, logR, logR, logSegs)
    .rotate([0, 90, 0]).translate([xOff, 0, z]);
  parts.push(g.translate([0, logR, 0]));
  parts.push(g.translate([0, D - logR, 0]));
}

// --- Floor ---
parts.push(Manifold.cube([W, D, logR * 0.5]));

// --- Roof shell ---
const roofOuter = CrossSection.ofPolygons([
  [[-ov, -0.3], [W + ov, -0.3], [W / 2, roofH + 0.3]]
]).extrude(D + 2 * ov)
  .rotate([90, 0, 0]).translate([0, D + ov, H]);
const roofInner = CrossSection.ofPolygons([
  [[-ov + 1.2, roofT], [W + ov - 1.2, roofT], [W / 2, roofH - 0.3]]
]).extrude(D + 2 * ov - 2.4)
  .rotate([90, 0, 0]).translate([0, D + ov - 1.2, H]);

parts.push(roofOuter.subtract(roofInner));

return Manifold.union(parts);
`,
  },
  {
    label: 'v3 - windows, door, chimney',
    code: `
const { Manifold, CrossSection } = api;

const W = 40, D = 30, H = 18;
const roofH = 14, ov = 3, roofT = 0.8;
const logR = 1.0, logSegs = 8, cExt = 2.5;
const logD = 2 * logR;
const numRows = Math.floor(H / logD);

function xLog(len, y, z) {
  return Manifold.cylinder(len, logR, logR, logSegs)
    .rotate([0, 90, 0]).translate([-cExt, y, z]);
}
function yLog(len, x, z) {
  return Manifold.cylinder(len, logR, logR, logSegs)
    .rotate([-90, 0, 0]).translate([x, -cExt, z]);
}

const parts = [];
for (let i = 0; i < numRows; i++) {
  const z = logR + i * logD;
  parts.push(xLog(W + 2 * cExt, logR, z));
  parts.push(xLog(W + 2 * cExt, D - logR, z));
  parts.push(yLog(D + 2 * cExt, logR, z));
  parts.push(yLog(D + 2 * cExt, W - logR, z));
}

for (let j = 0; j < 20; j++) {
  const z = H + logR + j * logD;
  const t = (z - H) / roofH;
  if (t > 0.85) break;
  const gW = (W - 4 * logR) * (1 - t);
  if (gW < logD * 3) break;
  const xOff = (W - gW) / 2;
  const g = Manifold.cylinder(gW, logR, logR, logSegs)
    .rotate([0, 90, 0]).translate([xOff, 0, z]);
  parts.push(g.translate([0, logR, 0]));
  parts.push(g.translate([0, D - logR, 0]));
}

parts.push(Manifold.cube([W, D, logR * 0.5]));

// --- Union walls, then cut openings ---
let cabin = Manifold.union(parts);

const winW = 6, winH = 7, sill = 7;
const doorW = 7, doorH = 13;
const cutD = 4 * logR;

const cuts = Manifold.union([
  // Front windows
  Manifold.cube([winW, cutD, winH]).translate([7, -logR, sill]),
  Manifold.cube([winW, cutD, winH]).translate([W - 7 - winW, -logR, sill]),
  // Front door
  Manifold.cube([doorW, cutD, doorH]).translate([W / 2 - doorW / 2, -logR, 0]),
  // Side windows
  Manifold.cube([cutD, winW, winH]).translate([-logR, D / 2 - winW / 2, sill]),
  Manifold.cube([cutD, winW, winH]).translate([W - 3 * logR, D / 2 - winW / 2, sill]),
  // Back window
  Manifold.cube([winW, cutD, winH]).translate([W / 2 - winW / 2, D - 3 * logR, sill]),
]);
cabin = cabin.subtract(cuts);

// --- Window crossbars ---
const barW = 0.4, barD = 0.3;
function crosses(w, h, x, y, z, axis) {
  const hBar = axis === 'y'
    ? Manifold.cube([w, barD, barW]).translate([x, y, z + h / 2 - barW / 2])
    : Manifold.cube([barD, w, barW]).translate([x, y, z + h / 2 - barW / 2]);
  const vBar = axis === 'y'
    ? Manifold.cube([barW, barD, h]).translate([x + w / 2 - barW / 2, y, z])
    : Manifold.cube([barD, barW, h]).translate([x, y + w / 2 - barW / 2, z]);
  return [hBar, vBar];
}

const details = [
  ...crosses(winW, winH, 7, 0, sill, 'y'),
  ...crosses(winW, winH, W - 7 - winW, 0, sill, 'y'),
  ...crosses(winW, winH, W / 2 - winW / 2, D - barD, sill, 'y'),
  ...crosses(winW, winH, 0, D / 2 - winW / 2, sill, 'x'),
  ...crosses(winW, winH, W - barD, D / 2 - winW / 2, sill, 'x'),
];

// --- Door frame ---
const fT = 0.5, fD = 0.3;
const doorX = W / 2 - doorW / 2;
details.push(
  Manifold.cube([fT, fD, doorH]).translate([doorX - fT, 0, 0]),
  Manifold.cube([fT, fD, doorH]).translate([doorX + doorW, 0, 0]),
  Manifold.cube([doorW + 2 * fT, fD, fT]).translate([doorX - fT, 0, doorH]),
);

// --- Chimney (exterior, right side) ---
const chimW = 5, chimD = 5;
const chimH = H + roofH * 0.65;
const chimX = W + 0.5, chimY = D / 2 - chimD / 2;
const chimney = Manifold.cube([chimW, chimD, chimH]).translate([chimX, chimY, 0])
  .subtract(
    Manifold.cube([chimW - 1.5, chimD - 1.5, chimH + 1])
      .translate([chimX + 0.75, chimY + 0.75, 2])
  );

// --- Roof shell ---
const roofOuter = CrossSection.ofPolygons([
  [[-ov, -0.3], [W + ov, -0.3], [W / 2, roofH + 0.3]]
]).extrude(D + 2 * ov)
  .rotate([90, 0, 0]).translate([0, D + ov, H]);
const roofInner = CrossSection.ofPolygons([
  [[-ov + 1.2, roofT], [W + ov - 1.2, roofT], [W / 2, roofH - 0.3]]
]).extrude(D + 2 * ov - 2.4)
  .rotate([90, 0, 0]).translate([0, D + ov - 1.2, H]);
const roof = roofOuter.subtract(roofInner);

return Manifold.union([cabin, ...details, chimney, roof]);
`,
  },
  {
    label: 'v4 - shingled roof, porch, ridge beam',
    code: `
const { Manifold, CrossSection } = api;

const W = 40, D = 30, H = 18;
const roofH = 14, ov = 3, roofT = 0.8;
const logR = 1.0, logSegs = 8, cExt = 2.5;
const logD = 2 * logR;
const numRows = Math.floor(H / logD);

function xLog(len, y, z) {
  return Manifold.cylinder(len, logR, logR, logSegs)
    .rotate([0, 90, 0]).translate([-cExt, y, z]);
}
function yLog(len, x, z) {
  return Manifold.cylinder(len, logR, logR, logSegs)
    .rotate([-90, 0, 0]).translate([x, -cExt, z]);
}

const parts = [];
for (let i = 0; i < numRows; i++) {
  const z = logR + i * logD;
  parts.push(xLog(W + 2 * cExt, logR, z));
  parts.push(xLog(W + 2 * cExt, D - logR, z));
  parts.push(yLog(D + 2 * cExt, logR, z));
  parts.push(yLog(D + 2 * cExt, W - logR, z));
}

for (let j = 0; j < 20; j++) {
  const z = H + logR + j * logD;
  const t = (z - H) / roofH;
  if (t > 0.85) break;
  const gW = (W - 4 * logR) * (1 - t);
  if (gW < logD * 3) break;
  const xOff = (W - gW) / 2;
  const g = Manifold.cylinder(gW, logR, logR, logSegs)
    .rotate([0, 90, 0]).translate([xOff, 0, z]);
  parts.push(g.translate([0, logR, 0]));
  parts.push(g.translate([0, D - logR, 0]));
}

parts.push(Manifold.cube([W, D, logR * 0.5]));
let cabin = Manifold.union(parts);

// --- Cut openings ---
const winW = 6, winH = 7, sill = 7;
const doorW = 7, doorH = 13;
const cutD = 4 * logR;
cabin = cabin.subtract(Manifold.union([
  Manifold.cube([winW, cutD, winH]).translate([7, -logR, sill]),
  Manifold.cube([winW, cutD, winH]).translate([W - 7 - winW, -logR, sill]),
  Manifold.cube([doorW, cutD, doorH]).translate([W / 2 - doorW / 2, -logR, 0]),
  Manifold.cube([cutD, winW, winH]).translate([-logR, D / 2 - winW / 2, sill]),
  Manifold.cube([cutD, winW, winH]).translate([W - 3 * logR, D / 2 - winW / 2, sill]),
  Manifold.cube([winW, cutD, winH]).translate([W / 2 - winW / 2, D - 3 * logR, sill]),
]));

// --- Window crossbars + door frame ---
const barW = 0.4, barD = 0.3;
function crosses(w, h, x, y, z, axis) {
  const hBar = axis === 'y'
    ? Manifold.cube([w, barD, barW]).translate([x, y, z + h / 2 - barW / 2])
    : Manifold.cube([barD, w, barW]).translate([x, y, z + h / 2 - barW / 2]);
  const vBar = axis === 'y'
    ? Manifold.cube([barW, barD, h]).translate([x + w / 2 - barW / 2, y, z])
    : Manifold.cube([barD, barW, h]).translate([x, y + w / 2 - barW / 2, z]);
  return [hBar, vBar];
}
const details = [
  ...crosses(winW, winH, 7, 0, sill, 'y'),
  ...crosses(winW, winH, W - 7 - winW, 0, sill, 'y'),
  ...crosses(winW, winH, W / 2 - winW / 2, D - barD, sill, 'y'),
  ...crosses(winW, winH, 0, D / 2 - winW / 2, sill, 'x'),
  ...crosses(winW, winH, W - barD, D / 2 - winW / 2, sill, 'x'),
];
const fT = 0.5, fD = 0.3;
const doorX = W / 2 - doorW / 2;
details.push(
  Manifold.cube([fT, fD, doorH]).translate([doorX - fT, 0, 0]),
  Manifold.cube([fT, fD, doorH]).translate([doorX + doorW, 0, 0]),
  Manifold.cube([doorW + 2 * fT, fD, fT]).translate([doorX - fT, 0, doorH]),
);

// --- Chimney ---
const chimW = 5, chimD = 5;
const chimH = H + roofH * 0.65;
const chimX = W + 0.5, chimY = D / 2 - chimD / 2;
const chimney = Manifold.cube([chimW, chimD, chimH]).translate([chimX, chimY, 0])
  .subtract(
    Manifold.cube([chimW - 1.5, chimD - 1.5, chimH + 1])
      .translate([chimX + 0.75, chimY + 0.75, 2])
  );

// --- Roof shell ---
const roofOuter = CrossSection.ofPolygons([
  [[-ov, -0.3], [W + ov, -0.3], [W / 2, roofH + 0.3]]
]).extrude(D + 2 * ov)
  .rotate([90, 0, 0]).translate([0, D + ov, H]);
const roofInner = CrossSection.ofPolygons([
  [[-ov + 1.2, roofT], [W + ov - 1.2, roofT], [W / 2, roofH - 0.3]]
]).extrude(D + 2 * ov - 2.4)
  .rotate([90, 0, 0]).translate([0, D + ov - 1.2, H]);
let roof = roofOuter.subtract(roofInner);

// --- Shingle grooves (horizontal lines across roof) ---
const nShingles = 10;
const grooves = [];
for (let i = 1; i < nShingles; i++) {
  const z = H + (i / nShingles) * roofH;
  grooves.push(
    Manifold.cube([W + 2 * ov + 4, D + 2 * ov + 4, 0.15])
      .translate([-ov - 2, -ov - 2, z])
  );
}
roof = roof.subtract(Manifold.union(grooves));

// --- Ridge beam ---
const ridgeR = logR * 0.7;
const ridgeBeam = Manifold.cylinder(D + 2 * ov + 2, ridgeR, ridgeR, 8)
  .rotate([-90, 0, 0])
  .translate([W / 2, -ov - 1, H + roofH + ridgeR * 0.3]);

// --- Front porch ---
const porchD = 6, porchW = W - 4;
const porchFloor = Manifold.cube([porchW, porchD, 0.8])
  .translate([2, -porchD, 0]);
const postR = 0.6, postH = H - 0.8;
const post1 = Manifold.cylinder(postH, postR, postR, 8)
  .translate([4, -porchD + 1, 0.8]);
const post2 = Manifold.cylinder(postH, postR, postR, 8)
  .translate([W - 4, -porchD + 1, 0.8]);
// Porch beam across the top
const porchBeam = Manifold.cube([porchW, logR, logR])
  .translate([2, -porchD, H - logR]);

// --- Steps ---
const stepW = doorW + 3, stepD = 2, stepH = 0.8;
const stepX = W / 2 - stepW / 2;
const step1 = Manifold.cube([stepW, stepD, stepH])
  .translate([stepX, -porchD - stepD, 0]);
const step2 = Manifold.cube([stepW, stepD, stepH * 0.5])
  .translate([stepX, -porchD - 2 * stepD, 0]);

return Manifold.union([
  cabin, ...details, chimney, roof, ridgeBeam,
  porchFloor, post1, post2, porchBeam,
  step1, step2,
]);
`,
  },
];

async function main() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  // Suppress console noise
  page.on('console', () => {});

  console.log('Opening mainifold...');
  await page.goto('http://localhost:5173/?view=ai', { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for the engine to fully initialize by checking that a test cube produces geometry
  await page.waitForFunction(() => {
    if (typeof window.mainifold === 'undefined') return false;
    try {
      const r = window.mainifold.run('const { Manifold } = api; return Manifold.cube([1,1,1]);');
      return r.triangleCount > 0;
    } catch { return false; }
  }, { timeout: 30000 });
  console.log('Engine ready.');

  // Create session
  const session = await page.evaluate(() => window.mainifold.createSession('Log Cabin'));
  console.log(`Session created: ${session.id}`);

  // Run each version
  for (const v of VERSIONS) {
    console.log(`Running ${v.label}...`);

    const geo = await page.evaluate((code) => window.mainifold.run(code), v.code);

    if (geo.status === 'error') {
      console.error(`  ERROR: ${geo.error}`);
    } else {
      console.log(`  OK — ${geo.triangleCount} tris, vol=${Math.round(geo.volume)}`);
    }

    // Save as version
    await page.evaluate(async (label) => {
      return window.mainifold.saveVersion(label);
    }, v.label);
  }

  // Get gallery URL
  const galleryUrl = await page.evaluate(() => window.mainifold.getGalleryUrl());
  console.log(`\nGallery: ${galleryUrl}`);

  const state = await page.evaluate(() => window.mainifold.getSessionState());
  console.log(`Versions: ${state.versionCount}`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
