/// <reference types="vite/client" />

declare module 'alea' {
  /** [s0, s1, s2, c]: enough to resume a generator exactly where it stopped (a save keeps it). */
  export type AleaState = [number, number, number, number];
  export interface AleaGenerator {
    (): number;
    exportState(): AleaState;
    importState(state: AleaState): void;
  }
  export default function alea(seed: string): AleaGenerator;
}
