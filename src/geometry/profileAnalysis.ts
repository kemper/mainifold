// Z-Profile Feature Summary — auto-generated "what's at each height" report
import { sliceAtZ } from './crossSection';

export interface ContourDetail {
  centroid: [number, number];
  radius: number;
  area: number;
}

export interface ZFeature {
  zRange: [number, number];
  area: number;
  contourCount: number;
  contours: ContourDetail[];
  description: string;
}

export interface ZProfile {
  features: ZFeature[];
  transitions: { z: number; description: string }[];
  summary: string;
}

interface SliceSample {
  z: number;
  area: number;
  contourCount: number;
  contours: ContourDetail[];
}

function analyzeContour(points: number[][]): ContourDetail {
  let cx = 0, cy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Compute centroid and bounding box
  for (const [x, y] of points) {
    cx += x;
    cy += y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const n = points.length || 1;
  cx /= n;
  cy /= n;

  // Approximate radius from bounding box
  const rx = (maxX - minX) / 2;
  const ry = (maxY - minY) / 2;
  const radius = Math.round(((rx + ry) / 2) * 100) / 100;

  // Compute area via shoelace formula
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }
  area = Math.abs(area) / 2;

  return {
    centroid: [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10],
    radius,
    area: Math.round(area * 100) / 100,
  };
}

function sampleSlice(manifold: unknown, z: number): SliceSample | null {
  const result = sliceAtZ(manifold, z);
  if (!result) return null;

  const contours = result.polygons.map(analyzeContour);
  return {
    z,
    area: Math.round(result.area * 100) / 100,
    contourCount: result.polygons.length,
    contours,
  };
}

function describeContours(contours: ContourDetail[]): string {
  if (contours.length === 0) return 'empty';
  if (contours.length === 1) {
    const c = contours[0];
    const isCircular = c.area > 0 && Math.abs(c.area - Math.PI * c.radius * c.radius) / c.area < 0.3;
    if (isCircular) return `disc r=${c.radius.toFixed(1)}`;
    return `shape area=${c.area.toFixed(1)}`;
  }

  // Group similar contours (similar radius and radial distance from origin)
  const groups: { contours: ContourDetail[]; avgRadius: number; avgDist: number }[] = [];
  for (const c of contours) {
    const dist = Math.sqrt(c.centroid[0] ** 2 + c.centroid[1] ** 2);
    const match = groups.find(g =>
      Math.abs(g.avgRadius - c.radius) < Math.max(g.avgRadius * 0.3, 0.5) &&
      Math.abs(g.avgDist - dist) < Math.max(g.avgDist * 0.3, 1.0)
    );
    if (match) {
      match.contours.push(c);
      match.avgRadius = match.contours.reduce((s, cc) => s + cc.radius, 0) / match.contours.length;
      match.avgDist = match.contours.reduce((s, cc) => s + Math.sqrt(cc.centroid[0] ** 2 + cc.centroid[1] ** 2), 0) / match.contours.length;
    } else {
      groups.push({ contours: [c], avgRadius: c.radius, avgDist: dist });
    }
  }

  const parts = groups.map(g => {
    if (g.contours.length === 1) {
      return `1x r=${g.avgRadius.toFixed(1)} at dist=${g.avgDist.toFixed(1)}`;
    }
    return `${g.contours.length}x r=${g.avgRadius.toFixed(1)} at dist=${g.avgDist.toFixed(1)}`;
  });

  return parts.join(', ');
}

function isSignificantChange(a: SliceSample, b: SliceSample, maxArea: number): boolean {
  const areaThreshold = Math.max(maxArea * 0.05, 0.1);
  const areaDiff = Math.abs(a.area - b.area);
  const contourDiff = a.contourCount !== b.contourCount;
  return areaDiff > areaThreshold || contourDiff;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function analyzeZProfile(manifold: any, bbox: { min: number[]; max: number[] }, sampleCount = 20): ZProfile {
  const zMin = bbox.min[2];
  const zMax = bbox.max[2];
  const zRange = zMax - zMin;

  if (zRange <= 0) {
    return { features: [], transitions: [], summary: 'Flat or empty geometry' };
  }

  // Step 1: Sample at evenly-spaced heights (slightly inset to avoid edge artifacts)
  const inset = zRange * 0.005;
  const samples: SliceSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const z = zMin + inset + ((zRange - 2 * inset) * i) / (sampleCount - 1);
    const s = sampleSlice(manifold, z);
    if (s) samples.push(s);
  }

  if (samples.length === 0) {
    return { features: [], transitions: [], summary: 'No cross-sections found' };
  }

  const maxArea = Math.max(...samples.map(s => s.area));

  // Step 2: Find transition points (where cross-section changes significantly)
  const transitionIndices: number[] = [0]; // always start with first sample
  for (let i = 1; i < samples.length; i++) {
    if (isSignificantChange(samples[i - 1], samples[i], maxArea)) {
      transitionIndices.push(i);
    }
  }
  transitionIndices.push(samples.length - 1); // always include last

  // Step 3: Refine transition points with binary search
  const refinedTransitions: { z: number; description: string }[] = [];
  for (let t = 1; t < transitionIndices.length - 1; t++) {
    const idx = transitionIndices[t];
    const before = samples[idx - 1];
    const after = samples[idx];
    // Binary search for exact transition Z
    let lo = before.z, hi = after.z;
    for (let iter = 0; iter < 5; iter++) {
      const mid = (lo + hi) / 2;
      const midSample = sampleSlice(manifold, mid);
      if (!midSample) break;
      if (isSignificantChange(before, midSample, maxArea)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    const transZ = Math.round(((lo + hi) / 2) * 100) / 100;
    const desc = `area ${before.area.toFixed(1)} -> ${after.area.toFixed(1)}, contours ${before.contourCount} -> ${after.contourCount}`;
    refinedTransitions.push({ z: transZ, description: desc });
  }

  // Step 4: Group stable regions into features
  const features: ZFeature[] = [];
  let regionStart = 0;
  for (let t = 1; t < transitionIndices.length; t++) {
    const regionEnd = transitionIndices[t];
    const regionSamples = samples.slice(regionStart, regionEnd + 1);

    if (regionSamples.length > 0) {
      // Use the middle sample as representative
      const rep = regionSamples[Math.floor(regionSamples.length / 2)];
      const zLo = Math.round(regionSamples[0].z * 100) / 100;
      const zHi = Math.round(regionSamples[regionSamples.length - 1].z * 100) / 100;

      features.push({
        zRange: [zLo, zHi],
        area: rep.area,
        contourCount: rep.contourCount,
        contours: rep.contours,
        description: describeContours(rep.contours),
      });
    }
    regionStart = regionEnd;
  }

  // Step 5: Generate summary
  const summaryParts = features.map(f =>
    `z=${f.zRange[0].toFixed(1)}-${f.zRange[1].toFixed(1)}: ${f.description} (${f.contourCount} contour${f.contourCount !== 1 ? 's' : ''})`
  );
  const summary = summaryParts.join(' | ');

  return { features, transitions: refinedTransitions, summary };
}
