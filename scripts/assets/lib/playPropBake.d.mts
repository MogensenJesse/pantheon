// Types for the parts of playPropBake.mjs the dev server uses.
export function bakeOptimizedLod0ToPlayChain(
  sourceGlb: string,
  destLod0: string,
  options?: { emitLodChain?: boolean; onProgress?: (phase: string, message: string) => void },
): string[];
