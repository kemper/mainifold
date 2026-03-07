// L-bracket with inner fillet and 4 mounting holes
const { Manifold, CrossSection } = api;

// ---------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------
const verticalHeight = 60;   // total height of vertical leg
const horizontalWidth = 40;  // total width of horizontal leg
const thickness = 5;         // material thickness
const depth = 20;            // extrusion depth (Z)
const filletRadius = 3;      // inner corner fillet
const holeDiameter = 4;      // mounting hole diameter
const holeSegments = 32;

// ---------------------------------------------------------------
// L-profile with filleted inner corner
// ---------------------------------------------------------------
// Fillet at inner corner (thickness, thickness), center offset by radius
const fcx = thickness + filletRadius;
const fcy = thickness + filletRadius;
const filletSegs = 8;

const profile = [
  [0, 0],
  [horizontalWidth, 0],
  [horizontalWidth, thickness],
];

// Fillet arc from (fcx, thickness) to (thickness, fcy)
// Center at (fcx, fcy), sweeping from -90° to -180° (CW in angle = CCW polygon)
for (let i = 0; i <= filletSegs; i++) {
  const angle = -Math.PI / 2 - (i / filletSegs) * (Math.PI / 2);
  profile.push([
    fcx + filletRadius * Math.cos(angle),
    fcy + filletRadius * Math.sin(angle)
  ]);
}

profile.push([thickness, verticalHeight]);
profile.push([0, verticalHeight]);

const cs = CrossSection.ofPolygons([profile]);
const bracketBody = cs.extrude(depth);

// ---------------------------------------------------------------
// Mounting holes — cylinders subtracted through Z
// ---------------------------------------------------------------
const hr = holeDiameter / 2;

// Vertical leg: x centered in thickness, at y=15 and y=45
const vHole1 = Manifold.cylinder(depth, hr, hr, holeSegments)
  .translate([thickness / 2, 15, 0]);
const vHole2 = Manifold.cylinder(depth, hr, hr, holeSegments)
  .translate([thickness / 2, 45, 0]);

// Horizontal leg: y centered in thickness, at x=15 and x=30
const hHole1 = Manifold.cylinder(depth, hr, hr, holeSegments)
  .translate([15, thickness / 2, 0]);
const hHole2 = Manifold.cylinder(depth, hr, hr, holeSegments)
  .translate([30, thickness / 2, 0]);

const bracket = bracketBody
  .subtract(vHole1)
  .subtract(vHole2)
  .subtract(hHole1)
  .subtract(hHole2);

return bracket;
