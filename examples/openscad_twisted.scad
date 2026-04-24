// OpenSCAD: twisted column via linear_extrude
// Shows a parametric modeling idiom — loop + boolean + extrude with twist.

$fn = 32;

module star(outer=10, inner=4, points=5) {
  poly = [for (i = [0 : 2*points-1])
    let (r = (i % 2 == 0) ? outer : inner,
         a = i * 180 / points)
    [r * cos(a), r * sin(a)]];
  polygon(poly);
}

linear_extrude(height=30, twist=120, slices=30, convexity=4)
  star(outer=12, inner=5, points=6);
