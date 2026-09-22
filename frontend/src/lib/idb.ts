/**
 * Minimal IndexedDB key/value store.
 *
 * The design requires accepted shots to survive leaving the flow:
 * "Ảnh đã duyệt giữ trong IndexedDB theo phiên; quay lại trong 30 phút hỏi
 *  'Tiếp tục bộ đang chụp?'" — Claude-Plan.md §12.3.
 *
 * Blobs are stored directly; IndexedDB handles them natively, unlike localStorage.
 * Every call degrades to a no-op rather than throwing, so a private window or
 * blocked site data never breaks the flow.
 */

const DB_NAME = 'photowall';
const STORE = 'session';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        let request: IDBRequest;
        try {
          request = fn(db.transaction(STORE, mode).objectStore(STORE));
        } catch {
          return resolve(null);
        }
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => resolve(null);
      }),
  );
}

export function idbGet<T>(key: string): Promise<T | null> {
  return run<T>('readonly', (store) => store.get(key));
}

export function idbSet(key: string, value: unknown): Promise<unknown> {
  return run('readwrite', (store) => store.put(value, key));
}

export function idbDelete(key: string): Promise<unknown> {
  return run('readwrite', (store) => store.delete(key));
}
