import type { CrossSectionResult } from './types';
import { getModule } from './engine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sliceAtZ(manifold: any, z: number): CrossSectionResult | null {
  const mod = getModule();
  if (!mod || !manifold) return null;

  try {
    const cross = manifold.slice(z);
    const polys = cross.toPolygons();
    const area = cross.area();

    // Convert polygons to plain arrays
    const polygons: number[][][] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const poly of polys) {
      const points: number[][] = [];
      for (const pt of poly) {
        const x = pt[0] ?? pt.x;
        const y = pt[1] ?? pt.y;
        points.push([x, y]);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      polygons.push(points);
    }

    if (polygons.length === 0) {
      cross.delete();
      return {
        polygons: [],
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><text x="200" y="200" text-anchor="middle" fill="#666" font-size="14">No cross-section at this Z level</text></svg>',
        boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        area: 0,
      };
    }

    const svg = generateSVG(polygons, { minX, minY, maxX, maxY }, z);
    cross.delete();

    return {
      polygons,
      svg,
      boundingBox: { minX, minY, maxX, maxY },
      area,
    };
  } catch {
    return null;
  }
}

function generateSVG(
  polygons: number[][][],
  bb: { minX: number; minY: number; maxX: number; maxY: number },
  z: number,
): string {
  const padding = 20;
  const size = 400;
  const contentSize = size - padding * 2;

  const rangeX = bb.maxX - bb.minX || 1;
  const rangeY = bb.maxY - bb.minY || 1;
  const scale = contentSize / Math.max(rangeX, rangeY);

  const offsetX = padding + (contentSize - rangeX * scale) / 2;
  const offsetY = padding + (contentSize - rangeY * scale) / 2;

  const paths = polygons.map(poly => {
    const d = poly
      .map((pt, i) => {
        const x = offsetX + (pt[0] - bb.minX) * scale;
        const y = size - (offsetY + (pt[1] - bb.minY) * scale);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
    return `<path d="${d} Z" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.5"/>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#18181b"/>
  <g>
    ${paths}
  </g>
  <text x="${size - 10}" y="${size - 10}" text-anchor="end" fill="#71717a" font-size="11" font-family="monospace">Z = ${z.toFixed(2)}</text>
</svg>`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBoundingBox(manifold: any): { min: [number, number, number]; max: [number, number, number] } | null {
  try {
    const bbox = manifold.boundingBox();
    return {
      min: [bbox.min[0], bbox.min[1], bbox.min[2]],
      max: [bbox.max[0], bbox.max[1], bbox.max[2]],
    };
  } catch {
    return null;
  }
}
