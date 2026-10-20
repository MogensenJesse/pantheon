// scripts/checks/lib/memoryStore.ts — an in-memory save store for the checks
import type { SlotId, SlotMeta } from '../../../src/save/slots.ts';
import type { SaveStore } from '../../../src/save/store.ts';

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
