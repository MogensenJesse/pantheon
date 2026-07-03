// src/core/memoryFragments.ts — centralized memory-fragment mutations

import { state } from './state/gameState';

export function hasMemoryFragment(id: number): boolean {
  return state.memoryFragments.includes(id);
}

export function recordMemoryFragment(id: number): void {
  if (hasMemoryFragment(id)) return;
  state.memoryFragments.push(id);
}
