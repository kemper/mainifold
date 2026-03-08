// IndexedDB storage for sessions and versions

export interface Session {
  id: string;
  name: string;
  created: number;
  updated: number;
  referenceImages?: ReferenceImagesData | null;
}

export interface ReferenceImagesData {
  front?: string;
  right?: string;
  back?: string;
  left?: string;
  top?: string;
  perspective?: string;
}

export interface Version {
  id: string;
  sessionId: string;
  index: number;
  code: string;
  geometryData: Record<string, unknown> | null;
  thumbnail: Blob | null;
  label: string;
  timestamp: number;
}

const DB_NAME = 'mainifold';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('versions')) {
        const store = db.createObjectStore('versions', { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('sessionId_index', ['sessionId', 'index'], { unique: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function tx(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// === Sessions ===

export async function createSession(name?: string): Promise<Session> {
  const session: Session = {
    id: generateId(),
    name: name || `Session ${new Date().toLocaleDateString()}`,
    created: Date.now(),
    updated: Date.now(),
  };
  const store = await tx('sessions', 'readwrite');
  await reqToPromise(store.put(session));
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  const store = await tx('sessions', 'readonly');
  return reqToPromise(store.get(id)) as Promise<Session | null>;
}

export async function listSessions(): Promise<Session[]> {
  const store = await tx('sessions', 'readonly');
  const sessions = await reqToPromise(store.getAll()) as Session[];
  return sessions.sort((a, b) => b.updated - a.updated);
}

export async function updateSession(id: string, updates: Partial<Pick<Session, 'name' | 'updated' | 'referenceImages'>>): Promise<void> {
  const store = await tx('sessions', 'readwrite');
  const session = await reqToPromise(store.get(id)) as Session | null;
  if (!session) return;
  Object.assign(session, updates);
  await reqToPromise(store.put(session));
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDB();
  const txn = db.transaction(['sessions', 'versions'], 'readwrite');
  txn.objectStore('sessions').delete(id);
  // Delete all versions for this session
  const versionStore = txn.objectStore('versions');
  const index = versionStore.index('sessionId');
  const req = index.openCursor(IDBKeyRange.only(id));
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// === Versions ===

export async function saveVersion(
  sessionId: string,
  code: string,
  geometryData: Record<string, unknown> | null,
  thumbnail: Blob | null,
  label?: string,
): Promise<Version> {
  const versions = await listVersions(sessionId);
  const nextIndex = versions.length > 0 ? Math.max(...versions.map(v => v.index)) + 1 : 1;

  const version: Version = {
    id: generateId(),
    sessionId,
    index: nextIndex,
    code,
    geometryData,
    thumbnail,
    label: label || `v${nextIndex}`,
    timestamp: Date.now(),
  };

  const store = await tx('versions', 'readwrite');
  await reqToPromise(store.put(version));

  // Update session timestamp
  await updateSession(sessionId, { updated: Date.now() });

  return version;
}

export async function getVersion(id: string): Promise<Version | null> {
  const store = await tx('versions', 'readonly');
  return reqToPromise(store.get(id)) as Promise<Version | null>;
}

export async function listVersions(sessionId: string): Promise<Version[]> {
  const store = await tx('versions', 'readonly');
  const index = store.index('sessionId');
  const versions = await reqToPromise(index.getAll(IDBKeyRange.only(sessionId))) as Version[];
  return versions.sort((a, b) => a.index - b.index);
}

export async function getLatestVersion(sessionId: string): Promise<Version | null> {
  const versions = await listVersions(sessionId);
  return versions.length > 0 ? versions[versions.length - 1] : null;
}

export async function getVersionByIndex(sessionId: string, index: number): Promise<Version | null> {
  const store = await tx('versions', 'readonly');
  const idx = store.index('sessionId_index');
  return reqToPromise(idx.get([sessionId, index])) as Promise<Version | null>;
}

export async function getVersionCount(sessionId: string): Promise<number> {
  const store = await tx('versions', 'readonly');
  const index = store.index('sessionId');
  return reqToPromise(index.count(IDBKeyRange.only(sessionId)));
}

// === Database reset ===

export async function clearAllData(): Promise<void> {
  const db = await openDB();
  const txn = db.transaction(['sessions', 'versions'], 'readwrite');
  txn.objectStore('sessions').clear();
  txn.objectStore('versions').clear();
  await new Promise<void>((resolve, reject) => {
    txn.oncomplete = () => resolve();
    txn.onerror = () => reject(txn.error);
  });
}
