import type { MeshData, MeshResult } from './types';
import type { Engine, Language, ValidateResult } from './engines/types';
import { DEFAULT_LANGUAGE, isLanguage } from './engines/types';
import { manifoldJsEngine, getManifoldModule } from './engines/manifoldJs';
import { openscadEngine, runScadAsync, validateScadAsync } from './engines/openscad';

export type { Language };
export { isLanguage, DEFAULT_LANGUAGE };

const engines: Record<Language, Engine> = {
  'manifold-js': manifoldJsEngine,
  'scad': openscadEngine,
};

let activeLanguage: Language = DEFAULT_LANGUAGE;

export function getActiveLanguage(): Language {
  return activeLanguage;
}

export function setActiveLanguage(lang: Language): void {
  if (!isLanguage(lang)) return;
  activeLanguage = lang;
}

/** Initialize the specified engine (defaults to the manifold-js engine, which
 * is always eager-loaded since OpenSCAD needs it for the round-trip). */
export async function initEngine(lang: Language = DEFAULT_LANGUAGE): Promise<void> {
  // Always make sure manifold-js is ready (exports + slicing + ofMesh rely on it).
  await manifoldJsEngine.init();
  if (lang !== 'manifold-js') {
    await engines[lang].init();
  }
}

/** The manifold-3d module — used by crossSection.ts, exports, and the SCAD round-trip. */
export function getModule() {
  return getManifoldModule();
}

/** Resolve which language to use. Explicit lang arg wins; otherwise active language. */
function pickLang(lang?: Language): Language {
  if (lang && isLanguage(lang)) return lang;
  return activeLanguage;
}

/** Synchronous execution — works for manifold-js. For SCAD, use executeCodeAsync(). */
export function executeCode(source: string, lang?: Language): MeshResult {
  const l = pickLang(lang);
  if (l === 'scad') {
    return {
      mesh: null,
      manifold: null,
      error: 'OpenSCAD requires async execution — use executeCodeAsync() instead.',
    };
  }
  const engine = engines[l];
  if (!engine.isReady()) {
    return {
      mesh: null,
      manifold: null,
      error: `${engine.id} engine not initialized yet — try again after loading completes.`,
    };
  }
  return engine.run(source);
}

/** Async execution — works for all engines. SCAD creates a fresh WASM instance per run. */
export async function executeCodeAsync(source: string, lang?: Language): Promise<MeshResult> {
  const l = pickLang(lang);
  if (l === 'scad') {
    return runScadAsync(source);
  }
  // manifold-js is sync — just wrap it
  return executeCode(source, l);
}

/** Ensure the specified engine is initialized. Async; use to pre-warm SCAD. */
export async function ensureEngineReady(lang: Language): Promise<void> {
  if (!engines[lang].isReady()) {
    await engines[lang].init();
  }
}

/** Sync validation — works for manifold-js. */
export function validateCode(source: string, lang?: Language): ValidateResult {
  const l = pickLang(lang);
  if (l === 'scad') {
    return { valid: false, error: 'OpenSCAD validation requires async — use validateCodeAsync()' };
  }
  const engine = engines[l];
  if (!engine.isReady()) {
    return { valid: false, error: `${engine.id} engine not initialized` };
  }
  return engine.validate(source);
}

/** Async validation — works for all engines. */
export async function validateCodeAsync(source: string, lang?: Language): Promise<ValidateResult> {
  const l = pickLang(lang);
  if (l === 'scad') {
    return validateScadAsync(source);
  }
  return validateCode(source, l);
}

export function isEngineReady(lang: Language): boolean {
  return engines[lang].isReady();
}

/** Build a {@link MeshResult} from a raw MeshData blob (no code execution).
 *  Used by the free-mesh prototype to load a stored mesh as if it had been
 *  produced by user code. Errors here surface the same way runtime errors
 *  from the engine do: caller sees `{ mesh: null, manifold: null, error }`.
 *  manifold-js must already be initialized (callers should `await initEngine()` first). */
export function buildResultFromMesh(mesh: MeshData): MeshResult {
  const module = getManifoldModule();
  if (!module) {
    return { mesh: null, manifold: null, error: 'manifold-js engine not initialized' };
  }
  try {
    const manifold = module.Manifold.ofMesh(mesh);
    if (!manifold) {
      return { mesh: null, manifold: null, error: 'Manifold.ofMesh returned null' };
    }
    // Get the canonical mesh back so we have a consistent run-time view
    // (merge vectors, normalized indexing) for downstream rendering / export.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canonical = (manifold as any).getMesh();
    return {
      mesh: {
        vertProperties: canonical.vertProperties,
        triVerts: canonical.triVerts,
        numVert: canonical.numVert,
        numTri: canonical.numTri,
        numProp: canonical.numProp,
        mergeFromVert: canonical.mergeFromVert,
        mergeToVert: canonical.mergeToVert,
      },
      manifold,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { mesh: null, manifold: null, error: `Manifold.ofMesh failed: ${msg}` };
  }
}
