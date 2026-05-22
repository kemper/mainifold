// Unit tests for the click-to-insert codegen. Pure module, runs in Node
// (no browser) like tests/patch.spec.ts.

import { test, expect } from 'playwright/test';
import {
  emitPrimitive,
  emitPrimitiveJs,
  emitPrimitiveScad,
  emitOperationJs,
  emitOperationScad,
  scanPartsJs,
  scanPartsScad,
  splitTopLevelScad,
  uniqueName,
  sanitizeName,
  fmt,
  type PrimitiveSpec,
} from '../src/insert/codegen';
import {
  addJsDeclaration,
  ensureManifoldDestructure,
  isSimpleReturnExpr,
  appendScadStatement,
  replaceScadRanges,
} from '../src/insert/controller';
import { primitiveEntry, unionBoxes, pickPart, type RegistryEntry } from '../src/insert/spatial';

test.describe('fmt', () => {
  test('trims trailing zeros and normalizes -0', () => {
    expect(fmt(10)).toBe('10');
    expect(fmt(2.5)).toBe('2.5');
    expect(fmt(-0)).toBe('0');
    expect(fmt(1 / 3)).toBe('0.3333');
  });
});

test.describe('emitPrimitive — manifold-js', () => {
  test('cube with center', () => {
    const spec: PrimitiveSpec = { kind: 'cube', name: 'box1', size: [10, 10, 10], center: true };
    expect(emitPrimitiveJs(spec)).toBe('const box1 = Manifold.cube([10, 10, 10], true);');
  });

  test('sphere', () => {
    const spec: PrimitiveSpec = { kind: 'sphere', name: 'ball1', radius: 6 };
    expect(emitPrimitiveJs(spec)).toBe('const ball1 = Manifold.sphere(6);');
  });

  test('uniform cylinder uses two-arg form', () => {
    const spec: PrimitiveSpec = { kind: 'cylinder', name: 'cyl1', height: 20, radius: 4, center: false };
    expect(emitPrimitiveJs(spec)).toBe('const cyl1 = Manifold.cylinder(20, 4);');
  });

  test('centered cylinder shifts down by half height', () => {
    const spec: PrimitiveSpec = { kind: 'cylinder', name: 'cyl1', height: 20, radius: 4, center: true };
    expect(emitPrimitiveJs(spec)).toBe('const cyl1 = Manifold.cylinder(20, 4).translate([0, 0, -10]);');
  });

  test('cone passes both radii', () => {
    const spec: PrimitiveSpec = { kind: 'cone', name: 'cone1', height: 12, radiusBottom: 5, radiusTop: 0, center: false };
    expect(emitPrimitiveJs(spec)).toBe('const cone1 = Manifold.cylinder(12, 5, 0);');
  });

  test('position adds a translate; center+position combine', () => {
    const spec: PrimitiveSpec = { kind: 'cube', name: 'box1', size: [2, 2, 2], center: false, position: [5, 0, -3] };
    expect(emitPrimitiveJs(spec)).toBe('const box1 = Manifold.cube([2, 2, 2], false).translate([5, 0, -3]);');
  });

  test('lang dispatch routes to JS', () => {
    const spec: PrimitiveSpec = { kind: 'sphere', name: 's', radius: 1 };
    expect(emitPrimitive(spec, 'manifold-js')).toBe('const s = Manifold.sphere(1);');
  });
});

test.describe('emitPrimitive — OpenSCAD', () => {
  test('cube tagged with part comment', () => {
    const spec: PrimitiveSpec = { kind: 'cube', name: 'box1', size: [10, 10, 10], center: true };
    expect(emitPrimitiveScad(spec)).toBe('cube([10, 10, 10], center=true); // part: box1');
  });

  test('cylinder uses native center', () => {
    const spec: PrimitiveSpec = { kind: 'cylinder', name: 'cyl1', height: 20, radius: 4, center: true };
    expect(emitPrimitiveScad(spec)).toBe('cylinder(h=20, r=4, center=true); // part: cyl1');
  });

  test('cone uses r1/r2', () => {
    const spec: PrimitiveSpec = { kind: 'cone', name: 'c1', height: 12, radiusBottom: 5, radiusTop: 0, center: false };
    expect(emitPrimitiveScad(spec)).toBe('cylinder(h=12, r1=5, r2=0, center=false); // part: c1');
  });

  test('position wraps in translate', () => {
    const spec: PrimitiveSpec = { kind: 'sphere', name: 's1', radius: 3, position: [0, 0, 5] };
    expect(emitPrimitiveScad(spec)).toBe('translate([0, 0, 5]) sphere(r=3); // part: s1');
  });
});

test.describe('emitOperation — manifold-js', () => {
  test('union chains add', () => {
    expect(emitOperationJs('union', ['box1', 'ball1'], 'u1')).toBe('const u1 = box1.add(ball1);');
  });

  test('subtract removes the rest from the first', () => {
    expect(emitOperationJs('subtract', ['box1', 'ball1', 'cyl1'], 'cut1'))
      .toBe('const cut1 = box1.subtract(ball1).subtract(cyl1);');
  });

  test('intersect chains intersect', () => {
    expect(emitOperationJs('intersect', ['a', 'b'], 'i1')).toBe('const i1 = a.intersect(b);');
  });

  test('throws with fewer than two operands', () => {
    expect(() => emitOperationJs('union', ['only'], 'r')).toThrow(/two operands/);
  });
});

test.describe('emitOperation — OpenSCAD', () => {
  test('difference wraps statements, stripping their part tags', () => {
    const out = emitOperationScad(
      'subtract',
      ['cube([10, 10, 10], center=true); // part: box1', 'sphere(r=6); // part: ball1'],
      'cut1',
    );
    expect(out).toBe('difference() { // part: cut1\n  cube([10, 10, 10], center=true);\n  sphere(r=6);\n}');
  });

  test('union block', () => {
    const out = emitOperationScad('union', ['cube([1,1,1]);', 'sphere(r=1);'], 'u1');
    expect(out).toBe('union() { // part: u1\n  cube([1,1,1]);\n  sphere(r=1);\n}');
  });
});

test.describe('scanPartsJs', () => {
  test('finds top-level const declarations, skips destructure of api members', () => {
    const code = [
      'const { Manifold } = api;',
      'const box1 = Manifold.cube([10,10,10], true);',
      'const ball1 = Manifold.sphere(6);',
      'return box1.subtract(ball1);',
    ].join('\n');
    const names = scanPartsJs(code).map(p => p.name);
    // The destructure binds `Manifold` (inside braces) — our line regex sees
    // the `const {` and does NOT capture a name from it.
    expect(names).toContain('box1');
    expect(names).toContain('ball1');
    expect(names).not.toContain('Manifold');
  });

  test('dedupes repeated names', () => {
    const code = 'const a = 1;\nconst a = 2;';
    expect(scanPartsJs(code).map(p => p.name)).toEqual(['a']);
  });
});

test.describe('splitTopLevelScad / scanPartsScad', () => {
  test('splits simple statements', () => {
    const code = 'cube([1,1,1]);\nsphere(r=2);';
    const stmts = splitTopLevelScad(code).map(s => s.text);
    expect(stmts).toEqual(['cube([1,1,1]);', 'sphere(r=2);']);
  });

  test('keeps a brace block as one statement', () => {
    const code = 'difference() {\n  cube([2,2,2]);\n  sphere(r=1);\n}\ncube([1,1,1]);';
    const stmts = splitTopLevelScad(code).map(s => s.text);
    expect(stmts.length).toBe(2);
    expect(stmts[0].startsWith('difference()')).toBe(true);
    expect(stmts[1]).toBe('cube([1,1,1]);');
  });

  test('ignores semicolons inside strings and comments', () => {
    const code = 'echo("a;b"); // c;d\ncube([1,1,1]);';
    const stmts = splitTopLevelScad(code).map(s => s.text);
    expect(stmts.length).toBe(2);
  });

  test('part tags become names; untagged statements summarize', () => {
    const code = 'cube([10,10,10]); // part: box1\nsphere(r=3);';
    const parts = scanPartsScad(code);
    expect(parts[0].name).toBe('box1');
    expect(parts[1].name).toBe('sphere(r=3);');
  });
});

test.describe('naming helpers', () => {
  test('uniqueName increments past collisions', () => {
    expect(uniqueName('box', [])).toBe('box');
    expect(uniqueName('box', ['box'])).toBe('box2');
    expect(uniqueName('box', ['box', 'box2', 'box3'])).toBe('box4');
  });

  test('sanitizeName strips unsafe chars and leading digits', () => {
    expect(sanitizeName('my shape!')).toBe('my_shape_');
    expect(sanitizeName('3dthing')).toBe('_3dthing');
    expect(sanitizeName('')).toBe('part');
  });
});

test.describe('controller — JS return management', () => {
  test('isSimpleReturnExpr', () => {
    expect(isSimpleReturnExpr('box1')).toBe(true);
    expect(isSimpleReturnExpr('Manifold.cube([10,10,10], true)')).toBe(true);
    expect(isSimpleReturnExpr('a.subtract(b).union(c).warp(f).hull()')).toBe(false);
  });

  test('ensureManifoldDestructure adds the line only when missing', () => {
    expect(ensureManifoldDestructure('return Manifold.sphere(1);'))
      .toBe('const { Manifold } = api;\nreturn Manifold.sphere(1);');
    const already = 'const { Manifold, CrossSection } = api;\nreturn Manifold.sphere(1);';
    expect(ensureManifoldDestructure(already)).toBe(already);
    const direct = 'return api.Manifold.sphere(1);';
    expect(ensureManifoldDestructure(direct)).toBe(direct);
  });

  test('inserting into the default program repoints the return', () => {
    const code = 'const { Manifold } = api;\nreturn Manifold.cube([10, 10, 10], true);';
    const out = addJsDeclaration(code, 'const ball1 = Manifold.sphere(6);', 'ball1', 'ifSimple');
    expect(out.returnSet).toBe(true);
    expect(out.code).toBe(
      'const { Manifold } = api;\nconst ball1 = Manifold.sphere(6);\nreturn ball1;',
    );
  });

  test('appends a return when none exists', () => {
    const out = addJsDeclaration('const { Manifold } = api;\n', 'const box1 = Manifold.cube([1,1,1], true);', 'box1', 'force');
    expect(out.returnSet).toBe(true);
    expect(out.code).toContain('const box1 = Manifold.cube([1,1,1], true);');
    expect(out.code.trimEnd().endsWith('return box1;')).toBe(true);
  });

  test('ifSimple preserves a complex hand-written return', () => {
    const code = 'const { Manifold } = api;\nconst a = Manifold.cube([1,1,1]);\nreturn a.subtract(foo()).warp(fn).refine(3);';
    const out = addJsDeclaration(code, 'const ball1 = Manifold.sphere(2);', 'ball1', 'ifSimple');
    expect(out.returnSet).toBe(false);
    expect(out.code).toContain('const ball1 = Manifold.sphere(2);');
    expect(out.code).toContain('return a.subtract(foo()).warp(fn).refine(3);');
  });

  test('ignores the word "return" inside comments (default example regression)', () => {
    // The default "Basic shapes demo" has this exact comment, which previously
    // caused the real `return` to be merged into the comment and lost.
    const code = [
      'const { Manifold } = api;',
      'const box = Manifold.cube([10, 10, 10], true);',
      'const result = box.subtract(box);',
      '',
      '// Always return the final Manifold object',
      'return result;',
    ].join('\n');
    const out = addJsDeclaration(code, 'const cut = box.subtract(ball);', 'cut', 'force');
    expect(out.returnSet).toBe(true);
    expect(out.code).toContain('// Always return the final Manifold object');
    expect(out.code).toMatch(/^return cut;$/m);
    expect(out.code).toContain('const cut = box.subtract(ball);');
  });

  test('force overrides even a complex return (used by operations)', () => {
    const code = 'const { Manifold } = api;\nreturn a.subtract(foo()).warp(fn);';
    const out = addJsDeclaration(code, 'const cut1 = box1.subtract(ball1);', 'cut1', 'force');
    expect(out.returnSet).toBe(true);
    expect(out.code).toContain('return cut1;');
    expect(out.code).not.toContain('warp(fn)');
  });
});

test.describe('spatial — 3D pick math', () => {
  test('primitiveEntry for a centered cube is symmetric about the origin', () => {
    const e = primitiveEntry({ kind: 'cube', name: 'b', size: [10, 10, 10], center: true });
    expect(e.box.min).toEqual([-5, -5, -5]);
    expect(e.box.max).toEqual([5, 5, 5]);
    expect(e.center).toEqual([0, 0, 0]);
  });

  test('primitiveEntry for an uncentered cube spans origin→size, shifted by position', () => {
    const e = primitiveEntry({ kind: 'cube', name: 'b', size: [4, 4, 4], center: false, position: [10, 0, 0] });
    expect(e.box.min).toEqual([10, 0, 0]);
    expect(e.box.max).toEqual([14, 4, 4]);
    expect(e.center).toEqual([12, 2, 2]);
  });

  test('primitiveEntry for a centered cylinder spans -h/2..h/2', () => {
    const e = primitiveEntry({ kind: 'cylinder', name: 'c', height: 20, radius: 3, center: true });
    expect(e.box.min).toEqual([-3, -3, -10]);
    expect(e.box.max).toEqual([3, 3, 10]);
  });

  test('pickPart prefers the box that contains the point', () => {
    const reg = new Map<string, RegistryEntry>([
      ['box', primitiveEntry({ kind: 'cube', name: 'box', size: [4, 4, 4], center: false, position: [10, 0, 0] })],
      ['ball', primitiveEntry({ kind: 'sphere', name: 'ball', radius: 3, position: [-10, 0, 0] })],
    ]);
    const valid = new Set(['box', 'ball']);
    expect(pickPart([12, 2, 2], reg, valid)).toBe('box');
    expect(pickPart([-10, 0, 0], reg, valid)).toBe('ball');
  });

  test('pickPart ignores names absent from the live code', () => {
    const reg = new Map<string, RegistryEntry>([
      ['ball', primitiveEntry({ kind: 'sphere', name: 'ball', radius: 3, position: [-10, 0, 0] })],
    ]);
    expect(pickPart([-10, 0, 0], reg, new Set())).toBeNull();
  });

  test('unionBoxes wraps all operands', () => {
    const a = primitiveEntry({ kind: 'cube', name: 'a', size: [2, 2, 2], center: true });
    const b = primitiveEntry({ kind: 'cube', name: 'b', size: [2, 2, 2], center: false, position: [10, 10, 10] });
    const u = unionBoxes([a, b]);
    expect(u?.box.min).toEqual([-1, -1, -1]);
    expect(u?.box.max).toEqual([12, 12, 12]);
  });
});

test.describe('controller — SCAD splicing', () => {
  test('appendScadStatement adds a trailing newline-separated statement', () => {
    expect(appendScadStatement('cube([1,1,1]);', 'sphere(r=2);'))
      .toBe('cube([1,1,1]);\nsphere(r=2);\n');
  });

  test('replaceScadRanges collapses two statements into a block', () => {
    const code = 'cube([10,10,10], center=true); // part: box1\nsphere(r=6); // part: ball1\n';
    const box = { from: 0, to: code.indexOf('\n') };
    const ballStart = code.indexOf('sphere');
    const ball = { from: ballStart, to: code.indexOf('\n', ballStart) };
    const block = 'difference() { // part: cut1\n  cube([10,10,10], center=true);\n  sphere(r=6);\n}';
    const out = replaceScadRanges(code, [box, ball], block);
    expect(out).toContain('difference() { // part: cut1');
    expect(out).not.toContain('// part: box1');
    expect(out.indexOf('difference()')).toBe(0);
  });
});
