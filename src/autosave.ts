// Keeps the theme being edited in this browser's IndexedDB, so a reload or a closed
// tab doesn't lose work. Nothing leaves the browser.

import type { Flavour } from './schema';
import type { Snapshot } from './history';

export interface SavedWork {
  theme: Snapshot;
  flavour: Flavour;
  savedAt: number;
}

const DB = 'aktheme-studio';
const STORE = 'work';
const KEY = 'current';

function withStore<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 2);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.transaction!.oncomplete = () => db.close();
    };
  });
}

export async function loadWork(): Promise<SavedWork | undefined> {
  try {
    return await withStore<SavedWork | undefined>('readonly', (s) => s.get(KEY));
  } catch {
    return undefined; // storage blocked, e.g. some private windows
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Saves a moment after the last change, so a burst of edits is written once. */
export function saveWorkSoon(work: () => SavedWork, onError?: () => void) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    withStore('readwrite', (s) => s.put(work(), KEY)).catch(() => onError?.());
  }, 600);
}
