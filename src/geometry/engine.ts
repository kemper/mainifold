import type { MeshResult } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifoldModule: any = null;

export async function initEngine() {
  if (manifoldModule) return manifoldModule;
  const Module = await import('manifold-3d');
  manifoldModule = await Module.default();
  manifoldModule.setup();
  return manifoldModule;
}

export function getModule() {
  return manifoldModule;
}

export function executeCode(jsCode: string): MeshResult {
  if (!manifoldModule) {
    return { mesh: null, manifold: null, error: 'Engine not initialized' };
  }

  const {
    Manifold,
    CrossSection,
    setMinCircularAngle,
    setMinCircularEdgeLength,
    setCircularSegments,
  } = manifoldModule;

  const api = {
    Manifold,
    CrossSection,
    setMinCircularAngle,
    setMinCircularEdgeLength,
    setCircularSegments,
  };

  let result: InstanceType<typeof Manifold> | null = null;
  try {
    const fn = new Function('api', `"use strict";\n${jsCode}`);
    result = fn(api);

    if (!result || typeof result.getMesh !== 'function') {
      return {
        mesh: null,
        manifold: null,
        error: 'Code must return a Manifold object. Did you forget to `return` the final Manifold?',
      };
    }

    const mesh = result.getMesh();
    return {
      mesh: {
        vertProperties: mesh.vertProperties,
        triVerts: mesh.triVerts,
        numVert: mesh.numVert,
        numTri: mesh.numTri,
        numProp: mesh.numProp,
      },
      manifold: result,
      error: null,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { mesh: null, manifold: null, error: msg };
  }
}
