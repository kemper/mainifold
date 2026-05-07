// Cat-deterrent mat -- a semi-spikey, bumpy surface designed to discourage
// cats from walking across it. Tile or scale as needed.
//
// Design:
//   - 100 x 100 x 2 mm base plate (centered on origin, sits on z = 0)
//   - 8 x 8 grid of features with slight position jitter
//   - ~70% truncated-cone spikes (8-12 mm tall) with 0.5 mm blunt tips
//     (above the FDM slicer drop threshold; deters but won't pierce paw pads)
//   - ~30% stubby rounded bumps (3.5-5 mm tall) for visual / tactile variety
//   - Deterministic seeded RNG so the layout is reproducible
//
// Print orientation: flat side down on the bed, no supports needed.

const { Manifold } = api;

const baseW    = 100;   // base width  (mm)
const baseD    = 100;   // base depth  (mm)
const baseT    = 2;     // base thickness (mm)
const spacing  = 12;    // feature center spacing (mm)
const margin   = 7;     // border around features (mm)
const segments = 24;    // circular segments per feature

const cols = Math.floor((baseW - 2 * margin) / spacing) + 1;
const rows = Math.floor((baseD - 2 * margin) / spacing) + 1;

// Base plate, centered in XY, bottom on z = 0.
let mat = Manifold.cube([baseW, baseD, baseT], true).translate([0, 0, baseT / 2]);

// Seeded LCG so the same layout comes back on every run.
let _s = 1337;
const rand = () => {
  _s = (_s * 9301 + 49297) % 233280;
  return _s / 233280;
};

const xStart = -baseW / 2 + margin + ((baseW - 2 * margin) - (cols - 1) * spacing) / 2;
const yStart = -baseD / 2 + margin + ((baseD - 2 * margin) - (rows - 1) * spacing) / 2;

for (let i = 0; i < cols; i++) {
  for (let j = 0; j < rows; j++) {
    const x = xStart + i * spacing + (rand() - 0.5) * 1.5;
    const y = yStart + j * spacing + (rand() - 0.5) * 1.5;
    const pick = rand();

    let feature;
    if (pick < 0.7) {
      // Tall spike: truncated cone, 0.5 mm blunt tip
      const h     = 8.0 + rand() * 4.0;     // 8 - 12 mm above base
      const baseR = 3.0 + rand() * 0.6;     // 3.0 - 3.6 mm
      const topR  = 0.5;                     // ~0.78 mm^2 plateau
      feature = Manifold.cylinder(h + 0.5, baseR, topR, segments)
        .translate([x, y, baseT - 0.5]);    // overlap base by 0.5 mm to weld
    } else {
      // Stubby bump: short, fat truncated cone (reads as a rounded nub)
      const h     = 3.5 + rand() * 1.5;     // 3.5 - 5 mm above base
      const baseR = 4.0 + rand() * 0.6;     // 4.0 - 4.6 mm
      const topR  = 2.2 + rand() * 0.4;     // 2.2 - 2.6 mm
      feature = Manifold.cylinder(h + 0.5, baseR, topR, segments)
        .translate([x, y, baseT - 0.5]);
    }
    mat = mat.add(feature);
  }
}

return mat;
