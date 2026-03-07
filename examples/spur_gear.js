// Spur gear — involute tooth profile, 16 teeth, center bore
const { Manifold, CrossSection } = api;

// ---------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------
const m = 2;              // module (tooth size in mm)
const z = 16;             // number of teeth
const alpha = 20;         // pressure angle in degrees
const faceWidth = 8;      // face width (thickness) in mm
const boreDiameter = 5;   // center bore hole diameter in mm
const segments = 128;     // smoothness for circular operations

// ---------------------------------------------------------------
// Derived Geometry
// ---------------------------------------------------------------
const alphaRad = alpha * Math.PI / 180;
const pitchRadius = (m * z) / 2;               // 16mm
const addendum = m;                              // 2mm
const dedendum = 1.25 * m;                      // 2.5mm
const outerRadius = pitchRadius + addendum;      // 18mm
const rootRadius = pitchRadius - dedendum;       // 13.5mm
const baseRadius = pitchRadius * Math.cos(alphaRad); // ~15.035mm

// ---------------------------------------------------------------
// Involute helpers
// ---------------------------------------------------------------
function involute(rb, t) {
  return [
    rb * (Math.cos(t) + t * Math.sin(t)),
    rb * (Math.sin(t) - t * Math.cos(t))
  ];
}

function involuteParam(rb, r) {
  if (r <= rb) return 0;
  return Math.sqrt((r / rb) * (r / rb) - 1);
}

function involuteAngle(pressureAngle) {
  return Math.tan(pressureAngle) - pressureAngle;
}

// ---------------------------------------------------------------
// Build one tooth (centered on +X axis)
// ---------------------------------------------------------------
const toothThicknessAtPitch = Math.PI * m / 2;
const halfToothAngle = toothThicknessAtPitch / (2 * pitchRadius);
const invAtPitch = involuteAngle(alphaRad);
const rotationOffset = halfToothAngle + invAtPitch;

const nPtsInvolute = 20;
const tStart = involuteParam(baseRadius, Math.max(rootRadius, baseRadius));
const tEnd = involuteParam(baseRadius, outerRadius);

// Right flank (root → tip)
const rightFlank = [];
for (let i = 0; i <= nPtsInvolute; i++) {
  const t = tStart + (tEnd - tStart) * (i / nPtsInvolute);
  const [ix, iy] = involute(baseRadius, t);
  const cos = Math.cos(rotationOffset);
  const sin = Math.sin(rotationOffset);
  rightFlank.push([ix * cos - iy * sin, ix * sin + iy * cos]);
}

// Left flank (mirror of right, reversed: tip → root)
const leftFlank = [];
for (let i = nPtsInvolute; i >= 0; i--) {
  const [x, y] = rightFlank[i];
  leftFlank.push([x, -y]);
}

// Tip arc between flanks
const tipRight = rightFlank[rightFlank.length - 1];
const tipLeft = leftFlank[0];
const tipAngleRight = Math.atan2(tipRight[1], tipRight[0]);
const tipAngleLeft = Math.atan2(tipLeft[1], tipLeft[0]);

const nPtsTip = 5;
const tipArc = [];
for (let i = 1; i < nPtsTip; i++) {
  const frac = i / nPtsTip;
  const ang = tipAngleRight + (tipAngleLeft - tipAngleRight) * frac;
  tipArc.push([outerRadius * Math.cos(ang), outerRadius * Math.sin(ang)]);
}

const toothProfile = [...rightFlank, ...tipArc, ...leftFlank];

// ---------------------------------------------------------------
// Replicate teeth around the gear with root arcs between them
// ---------------------------------------------------------------
const toothAngle = (2 * Math.PI) / z;
const gearContour = [];

for (let i = 0; i < z; i++) {
  const angle = i * toothAngle;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Rotate tooth profile
  for (const [px, py] of toothProfile) {
    gearContour.push([px * cos - py * sin, px * sin + py * cos]);
  }

  // Root arc to next tooth
  const nextAngle = (i + 1) * toothAngle;
  const nextCos = Math.cos(nextAngle);
  const nextSin = Math.sin(nextAngle);

  const rootEnd = toothProfile[toothProfile.length - 1];
  const rootEndRotated = [rootEnd[0] * cos - rootEnd[1] * sin, rootEnd[0] * sin + rootEnd[1] * cos];
  const rootEndAngle = Math.atan2(rootEndRotated[1], rootEndRotated[0]);

  const rootStart = toothProfile[0];
  const rootStartRotated = [rootStart[0] * nextCos - rootStart[1] * nextSin, rootStart[0] * nextSin + rootStart[1] * nextCos];
  let rootStartAngle = Math.atan2(rootStartRotated[1], rootStartRotated[0]);
  if (rootStartAngle <= rootEndAngle) rootStartAngle += 2 * Math.PI;

  const nPtsRoot = 5;
  for (let j = 1; j < nPtsRoot; j++) {
    const frac = j / nPtsRoot;
    const ang = rootEndAngle + (rootStartAngle - rootEndAngle) * frac;
    gearContour.push([rootRadius * Math.cos(ang), rootRadius * Math.sin(ang)]);
  }
}

// ---------------------------------------------------------------
// Extrude gear profile and subtract center bore
// ---------------------------------------------------------------
const gearCS = CrossSection.ofPolygons([gearContour]);
const gearBody = Manifold.extrude(gearCS, faceWidth);
const bore = Manifold.cylinder(faceWidth + 0.2, boreDiameter / 2, boreDiameter / 2, segments)
  .translate([0, 0, -0.1]);

return gearBody.subtract(bore);
