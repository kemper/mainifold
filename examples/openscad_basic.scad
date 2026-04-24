// OpenSCAD: basic boolean demo
// A cube with a cylindrical hole — same as basic_shapes.js, in SCAD.

difference() {
  cube([10, 10, 10], center=true);
  cylinder(h=12, r=4, center=true, $fn=32);
}
