# Build a Castle — mAInifold Session

You are working in a browser tab running mAInifold, an AI-agent-first 3D CAD tool. Your job is to build a detailed castle model with multiple design iterations saved as versions in a session.

## Step 0: Read the instructions

Fetch and read the AI agent instructions at this URL to understand the full API and geometry primitives:

```
http://localhost:5173/ai.md
```

Read that document completely before writing any code. It contains the console API reference, primitive constructors, transform methods, the iteration workflow, and **common pitfalls for boolean operations**.

## Step 1: Create a session

```js
await mainifold.createSession("Castle Design")
```

## Step 2: Build iteratively — 4 versions

Build the castle incrementally. After each version, check the stats and fix any issues before moving on.

### Version 1 — Base structure (walls + corner towers)

Write geometry code that creates:
- A square outer wall (e.g. 60x60 base, 12 high, 2 thick) — use a hollow box (outer minus inner)
- 4 cylindrical corner towers (radius ~5, height ~18) placed at the wall corners
- A flat ground plate under everything

**Critical:** Towers must overlap into the walls by at least 0.5 units — don't just place them flush at the corner or they'll be disconnected components.

Test it first:
```js
const r = await mainifold.runAndAssert(code, {
  maxComponents: 1,
  minVolume: 3000,
  genus: 0
})
```

If `r.passed` is true, save it:
```js
await mainifold.runAndSave(code, "v1 - walls and towers")
```

If it fails and `componentCount > 1`, use `runAndExplain` to find which pieces are disconnected:
```js
const e = await mainifold.runAndExplain(code)
// e.components shows each piece's centroid and volume
// e.hints tells you what's likely wrong (detects flush placement too)
```

### Version 2 — Battlements

Take the v1 code and add:
- Rectangular merlons along the top of all 4 walls (use a loop to create evenly spaced blocks)
- Crenellations on the tower tops (circular array of merlons)

**Critical:** Merlons must overlap 0.5 units downward into the wall/tower top — don't place them at exactly `wallTopZ` or they'll float as disconnected components.

Test with `runAndAssert` — volume should increase vs v1, still 1 component. Save as "v2 - battlements".

Check the `diff` in the return value of `runAndSave` to confirm volume increased.

### Version 3 — Gate and windows

Add to the v2 code:
- A gate opening in one wall — subtract an arched shape (rectangle + half-cylinder on top)
- Arrow slit windows on walls — narrow vertical rectangles subtracted from walls
- Small windows on towers — subtract small cubes or cylinders

Test with `runAndAssert` — volume should decrease (subtractions), genus should increase (through-holes). Use `minGenus: 1` instead of an exact genus value since the hole count depends on geometry overlap. Still 1 component. Save as "v3 - gate and windows".

### Version 4 — Keep and spires

Add to the v3 code:
- A central keep (larger rectangular building in the courtyard, taller than walls)
- Conical spires on each tower top (cones using `cylinder(height, baseRadius, 0, segments)`)
- A taller spire on the keep
- Optional: flag poles (thin cylinders) on spire tips

**Critical spire placement:** The spire base must overlap into the solid part of the tower/keep wall. If the tower is hollow, the spire base radius must exceed the inner void radius. And the spire must start 0.5 units below the top surface, not flush on top.

**Critical flag poles:** Start the pole 1-2 units below the cone tip, not at the exact tip (radius = 0 has no material to union with).

Test and save as "v4 - keep and spires".

## Step 3: Review

After all 4 versions are saved, the gallery URL is returned by `runAndSave`. You can also get it with:

```js
mainifold.getGalleryUrl()
```

Report the URL so the human can review all versions side by side.

## Guidelines

- **All code must `return` a single Manifold object.** Use `Manifold.union([...])` to combine everything.
- **Use `Manifold.union(array)` not chained `.add()` calls** — the batch version is faster.
- **Coordinate system is Z-up.** The ground is the XY plane. Build upward in Z.
- **Keep segment counts moderate** (24-32) for cylinders during iteration. High counts slow down booleans.
- **Always overlap joined geometry by at least 0.5 units.** Flush placement = disconnected components. This is the #1 source of bugs.
- **After each `runAndAssert` failure**, read the failures array carefully. If `componentCount > 1`, use `runAndExplain(code)` to identify which pieces are floating and where.
- **Use `runIsolated(code)` if you want to check stats** without committing to the viewport — useful for quick experiments.
