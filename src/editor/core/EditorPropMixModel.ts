// src/editor/core/EditorPropMixModel.ts — shared Place brush/fill mix

export interface EditorPropMixModel {
  has: (id: string) => boolean;
  getIds: () => readonly string[];
  getWeight: (id: string) => number;
  getWeights: () => Readonly<Record<string, number>>;
  toggle: (id: string) => void;
  addMany: (ids: readonly string[]) => void;
  setWeight: (id: string, weight: number) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createEditorPropMixModel(): EditorPropMixModel {
  const ids = new Set<string>();
  const weights = new Map<string, number>();
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const ensureWeight = (id: string) => {
    if (!weights.has(id)) weights.set(id, 1);
  };

  return {
    has: (id) => ids.has(id),
    getIds: () => [...ids],
    getWeight: (id) => weights.get(id) ?? 1,
    getWeights: () => {
      const out: Record<string, number> = {};
      for (const id of ids) out[id] = weights.get(id) ?? 1;
      return out;
    },
    toggle: (id) => {
      if (ids.has(id)) {
        ids.delete(id);
        weights.delete(id);
      } else {
        ids.add(id);
        ensureWeight(id);
      }
      emit();
    },
    addMany: (nextIds) => {
      let changed = false;
      for (const id of nextIds) {
        if (ids.has(id)) continue;
        ids.add(id);
        ensureWeight(id);
        changed = true;
      }
      if (changed) emit();
    },
    setWeight: (id, weight) => {
      if (!ids.has(id)) return;
      const next = Math.max(0, weight);
      if (weights.get(id) === next) return;
      weights.set(id, next);
      emit();
    },
    clear: () => {
      if (ids.size === 0) return;
      ids.clear();
      weights.clear();
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener();
      return () => listeners.delete(listener);
    },
  };
}
