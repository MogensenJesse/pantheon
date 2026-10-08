// src/map/overlayChannels.ts — channel layout of the terrain overlay mask texture (grid-sized RGBA8)

/**
 * One RGBA8 texture carries every per-cell overlay the splat shader reads at the same grid UV:
 * three blurred biome masks and the authored convex ridge. Packing them keeps the terrain material
 * inside the 16-fragment-texture budget.
 *
 * Ownership: the three masks are baked from the biome grid; the village writes more path into `path`
 * at runtime (roads, yards, footstep wear), so a re-bake of those cells must be followed by the
 * village re-applying its marks.
 */
export const OVERLAY_STRIDE = 4;

export const OVERLAY_CHANNEL = {
  /** Blurred Path biome mask (+ village roads and wear). */
  path: 0,
  /** Blurred Meadow biome mask. */
  meadow: 1,
  /** Blurred Water biome mask (seabed overlay). */
  water: 2,
  /** Authored convex ridge, 0..255. */
  convex: 3,
} as const;
