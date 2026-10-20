// src/world/village/model/selection.ts — something in the village that can be picked: a villager, a building or a field
// (pure: node-runnable)

export type Selection =
  | { kind: 'villager'; index: number }
  | { kind: 'building'; id: number }
  | { kind: 'field'; id: number };
