import { getRefineFactor } from './qualitySettings';

/** Apply the user's global mesh-refinement factor (the editor "Detail" slider)
 *  to a manifold, returning a refined copy and releasing the original from the
 *  WASM heap. Returns the input unchanged when the factor is 1 (off), when the
 *  object has no refine() (render-only proxies), or when refine() throws on
 *  degenerate geometry — so a model always still renders. */
export function applyGlobalRefine<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends { refine?: (n: number) => any; delete?: () => void },
>(manifold: T): T {
  const factor = getRefineFactor();
  if (factor <= 1 || typeof manifold.refine !== 'function') return manifold;
  try {
    const refined = manifold.refine(factor) as T;
    if (typeof manifold.delete === 'function') manifold.delete();
    return refined;
  } catch {
    return manifold;
  }
}
