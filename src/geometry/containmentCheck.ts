// Containment/Occlusion Detection — warns when a component is fully inside another
import { getBoundingBox } from './crossSection';

export interface ContainmentWarning {
  containedIndex: number;
  containingIndex: number;
  containedVolume: number;
  containedCentroid: [number, number, number];
  message: string;
}

interface ComponentInfo {
  index: number;
  volume: number;
  centroid: [number, number, number];
  boundingBox: { min: number[]; max: number[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manifold: any;
}

function bboxContains(outer: { min: number[]; max: number[] }, inner: { min: number[]; max: number[] }): boolean {
  for (let i = 0; i < 3; i++) {
    if (inner.min[i] < outer.min[i] - 0.01 || inner.max[i] > outer.max[i] + 0.01) {
      return false;
    }
  }
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function checkContainment(manifold: any): ContainmentWarning[] {
  const warnings: ContainmentWarning[] = [];

  let parts: unknown[];
  try {
    parts = manifold.decompose();
  } catch {
    return warnings;
  }

  if (parts.length <= 1) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of parts) (p as any).delete();
    return warnings;
  }

  // Collect component info — keep manifold references alive for intersection check
  const components: ComponentInfo[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (let i = 0; i < parts.length && i < 25; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = parts[i] as any;
    try {
      const bb = getBoundingBox(p);
      const vol = p.volume();
      const centroid = bb
        ? [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2] as [number, number, number]
        : [0, 0, 0] as [number, number, number];
      components.push({
        index: i,
        volume: vol,
        centroid,
        boundingBox: bb ?? { min: [0, 0, 0], max: [0, 0, 0] },
        manifold: p,
      });
    } catch {
      try { p.delete(); } catch { /* ignore */ }
    }
  }
  // Delete remaining parts beyond the limit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (let i = 25; i < parts.length; i++) {
    try { (parts[i] as any).delete(); } catch { /* ignore */ }
  }

  // Pairwise containment check (smaller inside larger)
  for (let i = 0; i < components.length; i++) {
    for (let j = 0; j < components.length; j++) {
      if (i === j) continue;

      const larger = components[i];
      const smaller = components[j];
      if (smaller.volume >= larger.volume) continue;

      // Fast filter: smaller's bbox must be within larger's bbox
      if (!bboxContains(larger.boundingBox, smaller.boundingBox)) continue;

      // Precise check: compute intersection volume
      try {
        const intersection = larger.manifold.intersect(smaller.manifold);
        const intVol = intersection.volume();
        intersection.delete();

        const tolerance = smaller.volume * 0.05; // 5% tolerance
        if (Math.abs(intVol - smaller.volume) <= tolerance) {
          const dims = [
            smaller.boundingBox.max[0] - smaller.boundingBox.min[0],
            smaller.boundingBox.max[1] - smaller.boundingBox.min[1],
            smaller.boundingBox.max[2] - smaller.boundingBox.min[2],
          ].map(d => Math.round(d * 10) / 10);

          warnings.push({
            containedIndex: smaller.index,
            containingIndex: larger.index,
            containedVolume: Math.round(smaller.volume * 100) / 100,
            containedCentroid: smaller.centroid,
            message: `Component ${smaller.index} (vol=${Math.round(smaller.volume)}, dims=[${dims}], centroid=[${smaller.centroid.map(c => Math.round(c * 10) / 10)}]) is fully contained within component ${larger.index} (vol=${Math.round(larger.volume)}) — it contributes nothing to the final shape`,
          });
        }
      } catch {
        // Boolean intersection failed — skip this pair
      }
    }
  }

  // Cleanup manifold references
  for (const c of components) {
    try { c.manifold.delete(); } catch { /* ignore */ }
  }

  return warnings;
}
