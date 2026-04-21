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
        error: 'Code must return a Manifold object. Did you forget to `return` the final Manifold? See /ai.md#before-you-start',
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
    let msg = e instanceof Error ? e.message : String(e);

    // Enhance common WASM error messages with actionable hints
    if (msg.includes('BindingError') && msg.includes('deleted object')) {
      msg += '\n💡 Hint: A Manifold or CrossSection was used after being deleted. Avoid calling .delete() on objects you still need, or store intermediate results before cleanup.';
    } else if (msg.includes('function _Cylinder called with')) {
      msg += '\n💡 Hint: Manifold.cylinder(height, radiusLow, radiusHigh?, segments?) — check argument count and order.';
    } else if (msg.includes('function _Cube called with')) {
      msg += '\n💡 Hint: Manifold.cube([x, y, z], center?) — first arg must be an array of 3 numbers.';
    } else if (msg.includes('Missing field')) {
      msg += '\n💡 Hint: You may have passed an array where an object was expected, or vice versa. Check the API signature.';
    } else if (msg.includes('unreachable') || msg.includes('RuntimeError')) {
      msg += '\n💡 Hint: WASM runtime error — likely caused by degenerate geometry (zero-area face, self-intersection, or invalid boolean). Try simplifying the operation or checking input dimensions.';
    }

    return { mesh: null, manifold: null, error: msg };
  }
}
