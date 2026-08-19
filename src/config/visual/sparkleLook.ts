// src/config/visual/sparkleLook.ts — shared HDR sparkle defaults (guide path + player orb)
/** Gold / cyan / violet energy palette used by ribbon and sparkle sprites. */
export const SPARKLE_PALETTE = {
  colorAHex: 0xffcc44,
  colorBHex: 0x44e8ff,
  colorCHex: 0xd080ff,
  colorTravelM: 18,
} as const;

/** Billboard look shared by both sparkle fields; systems override density / spread. */
export const SPARKLE_LOOK = {
  sizeM: 0.035,
  hdr: 2,
  spin: 0.7,
} as const;

/** Per-field sparkle tunables passed into `createSparkleField`. */
export interface SparkleLookSettings {
  sizeM: number;
  spreadM: number;
  idle: number;
  hdr: number;
  spin: number;
  breathAmount: number;
  breathSpeed: number;
  colorAHex: number;
  colorBHex: number;
  colorCHex: number;
  colorTravelM: number;
  pulseSpeed: number;
  pulseSpacingM: number;
  pulseLengthM: number;
}
