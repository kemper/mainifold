// Durable storage request.
//
// All user work — sessions, version history, painted colors, annotations,
// imported meshes, AI keys, and chat transcripts — lives in IndexedDB, and
// downloaded WebLLM model weights live in the Cache Storage API. Both are
// "best-effort" by default: under storage pressure the browser may evict them.
// For a tool whose whole value is the work you've saved, that's a bad surprise,
// so we ask the browser to mark the origin's storage as persistent (exempt from
// automatic eviction).
//
// `navigator.storage.persist()` is a no-op-or-prompt depending on the browser:
//   - Chrome/Edge grant it silently based on engagement/installed-PWA signals.
//   - Firefox may prompt the user.
//   - Safari grants it heuristically.
// It never throws on rejection (resolves false), so this is safe to fire and
// forget at boot. We only ask when not already persisted.

/** Request durable storage for this origin if it isn't already granted.
 *  Fire-and-forget; resolves to the effective persisted state (or null when the
 *  API is unavailable). Never throws. */
export async function ensurePersistentStorage(): Promise<boolean | null> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage || typeof storage.persist !== 'function') return null;
    if (typeof storage.persisted === 'function' && (await storage.persisted())) {
      return true;
    }
    return await storage.persist();
  } catch {
    return null;
  }
}
