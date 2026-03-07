// Twisted vase using rotate and translate
const { Manifold } = api;

const slices = 40;
const height = 20;
let vase = Manifold.cube([0.01, 0.01, 0.01]); // start with tiny seed

for (let i = 0; i < slices; i++) {
  const t = i / slices;
  const z = t * height;
  const radius = 3 + Math.sin(t * Math.PI) * 3;
  const twist = t * 90; // degrees of twist

  const ring = Manifold.cylinder(height / slices + 0.01, radius, radius, 6)
    .rotate([0, 0, twist])
    .translate([0, 0, z]);

  vase = vase.add(ring);
}

return vase;
