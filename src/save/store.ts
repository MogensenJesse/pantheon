// src/save/store.ts — where saved games are kept: IndexedDB in the browser, a Map for tests
//
// IndexedDB rather than localStorage: saves are megabytes of typed arrays and writes must not block the
// frame. Two object stores keep the slot list cheap: `meta` holds one small line per slot, `data` the
// whole snapshot, and a write puts both in one transaction, so a failed write leaves the previous save
// of that slot (and the other slots) untouched.

import type { SlotId, SlotMeta } from './slots.ts';

export type SaveErrorCode = 'unavailable' | 'quota' | 'failed';

export class SaveError extends Error {
  readonly code: SaveErrorCode;
  constructor(code: SaveErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'SaveError';
    this.code = code;
  }
}

export interface SaveStore {
  list: () => Promise<SlotMeta[]>;
  /** The stored value exactly as written (not validated), or null for an empty slot. */
  read: (id: SlotId) => Promise<unknown | null>;
  /** Replaces the slot's line and save together, or changes nothing. */
  write: (meta: SlotMeta, data: unknown) => Promise<void>;
  remove: (id: SlotId) => Promise<void>;
}

/** In-memory store; values are structured-cloned in and out like IndexedDB does. */
export function createMemoryStore(): SaveStore & {
  readonly metas: Map<SlotId, SlotMeta>;
  readonly data: Map<SlotId, unknown>;
} {
  const metas = new Map<SlotId, SlotMeta>();
  const data = new Map<SlotId, unknown>();
  return {
    metas,
    data,
    list: async () => [...metas.values()].map((m) => structuredClone(m)),
    read: async (id) => (data.has(id) ? structuredClone(data.get(id)) : null),
    write: async (meta, value) => {
      const stored = structuredClone(value);
      metas.set(meta.id, structuredClone(meta));
      data.set(meta.id, stored);
    },
    remove: async (id) => {
      metas.delete(id);
      data.delete(id);
    },
  };
}

const DB_NAME = 'pantheon-saves';
const DB_VERSION = 1;
const META = 'meta';
const DATA = 'data';

function toSaveError(err: unknown, what: string): SaveError {
  if (err instanceof SaveError) return err;
  const name = err instanceof Error ? err.name : '';
  if (name === 'QuotaExceededError') {
    return new SaveError('quota', `Not enough storage space to ${what}.`, err);
  }
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return new SaveError(
      'unavailable',
      `Browser storage is unavailable, so the game cannot ${what}.`,
      err,
    );
  }
  return new SaveError('failed', `Could not ${what}.`, err);
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Settles when the transaction has committed (not when its requests have been queued). */
const committed = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });

/** Store backed by IndexedDB; opens lazily, and a failed open is retried on the next call. */
export function createIndexedDbStore(factory?: IDBFactory): SaveStore {
  let opening: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (opening) return opening;
    const idb = factory ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
    if (!idb) {
      return Promise.reject(new SaveError('unavailable', 'Browser storage is unavailable.'));
    }
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Let a newer tab upgrade the database instead of waiting on this one forever.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new SaveError('unavailable', 'Another tab is blocking the save database.'));
    }).catch((err) => {
      opening = null;
      throw toSaveError(err, 'open saved games');
    });
    return opening;
  };

  return {
    list: async () => {
      try {
        const db = await open();
        const tx = db.transaction(META, 'readonly');
        const metas = await requestResult(tx.objectStore(META).getAll());
        return metas as SlotMeta[];
      } catch (err) {
        throw toSaveError(err, 'list saved games');
      }
    },

    read: async (id) => {
      try {
        const db = await open();
        const tx = db.transaction(DATA, 'readonly');
        const value = await requestResult(tx.objectStore(DATA).get(id));
        return value ?? null;
      } catch (err) {
        throw toSaveError(err, 'read the save');
      }
    },

    write: async (meta, data) => {
      try {
        const db = await open();
        // 'strict' asks for the data to reach the disk before the commit is reported.
        const tx = db.transaction([META, DATA], 'readwrite', { durability: 'strict' });
        const done = committed(tx);
        try {
          tx.objectStore(DATA).put(data, meta.id);
          tx.objectStore(META).put(meta);
        } catch (err) {
          // e.g. DataCloneError: nothing was queued that may commit.
          tx.abort();
          await done.catch(() => {});
          throw err;
        }
        await done;
      } catch (err) {
        throw toSaveError(err, 'save the game');
      }
    },

    remove: async (id) => {
      try {
        const db = await open();
        const tx = db.transaction([META, DATA], 'readwrite');
        const done = committed(tx);
        tx.objectStore(DATA).delete(id);
        tx.objectStore(META).delete(id);
        await done;
      } catch (err) {
        throw toSaveError(err, 'delete the save');
      }
    },
  };
}
