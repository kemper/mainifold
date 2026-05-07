// Cat-deterrent mat -- low-plastic redesign. A dense field of small
// truncated-cone spikes on a thin base; cats avoid it because every step
// lands on 4-6 uneven points, not because individual spikes are sharp.
//
// Design:
//   - 100 x 100 x 1 mm base plate (centered on origin, sits on z = 0)
//   - 12 x 12 grid (~7.5 mm spacing) with slight position jitter
//   - All features are truncated cones: 1.5 mm base radius, 0.5 mm blunt
//     tip (~0.78 mm^2 plateau, above the FDM slicer drop threshold)
//   - Heights randomly 4-6 mm so the surface reads as both spikey and
//     bumpy without paying for tall pyramids or wide dome bumps
//   - Deterministic seeded RNG so the layout is reproducible
//
// Plastic budget: ~12 cm^3 (about half the previous 2 mm-base / tall-spike
// version). Spikes alone are ~17 mm^3 each; the rest is the thin base.
//
// Print orientation: flat side down on the bed, no supports needed.

const { Manifold } = api;

const baseW    = 100;   // base width  (mm)
const baseD    = 100;   // base depth  (mm)
const baseT    = 1;     // base thickness (mm) -- 5 layers at 0.2 mm
const spacing  = 7.5;   // feature center spacing (mm)
const margin   = 5;     // border around features (mm)
const segments = 16;    // circular segments per spike

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
    const x = xStart + i * spacing + (rand() - 0.5) * 1.0;
    const y = yStart + j * spacing + (rand() - 0.5) * 1.0;

    const h     = 4.0 + rand() * 2.0;   // 4 - 6 mm above base
    const baseR = 1.5;                   // narrow foot
    const topR  = 0.5;                   // blunt printable tip

    const spike = Manifold.cylinder(h + 0.4, baseR, topR, segments)
      .translate([x, y, baseT - 0.4]);   // 0.4 mm overlap welds spike to base

    mat = mat.add(spike);
  }
}

return mat;
