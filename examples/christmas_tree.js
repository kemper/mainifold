// Low-poly Christmas tree
const { Manifold, CrossSection } = api;

// -- Trunk: octagonal cylinder --
const trunk = Manifold.cylinder(4, 1.2, 1.0, 8)
  .translate([0, 0, 0]);

// -- Tree tiers: stacked cones with decreasing radius --
// Each tier is a low-poly cone (6-sided) that overlaps the one below
const tiers = [];
const tierData = [
  // [baseZ, height, radiusLow, radiusHigh]
  [3,   6,  7.0, 1.5],   // bottom tier — widest
  [7,   5,  5.5, 1.2],   // middle tier
  [10,  5,  4.0, 0.8],   // upper tier
  [13,  4,  2.8, 0.4],   // top tier
];

for (const [baseZ, h, rLow, rHigh] of tierData) {
  const tier = Manifold.cylinder(h, rLow, rHigh, 6)
    .translate([0, 0, baseZ]);
  tiers.push(tier);
}

const foliage = Manifold.union(tiers);

// -- Star on top: two intersecting tetrahedra (stellated octahedron) --
// This gives a spiky, low-poly star shape
const starZ = 17.5; // top of the highest tier
const starScale = 0.9;

const tetra1 = Manifold.tetrahedron()
  .scale([starScale, starScale, starScale]);

const tetra2 = Manifold.tetrahedron()
  .scale([starScale, starScale, starScale])
  .rotate([0, 0, 90])   // rotate around Z to offset vertices
  .mirror([0, 0, 1]);   // flip upside-down for stellated look

const star = tetra1.add(tetra2)
  .translate([0, 0, starZ]);

// -- Assemble everything --
const tree = trunk.add(foliage).add(star);

return tree;
