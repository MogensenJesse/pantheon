// src/config/visual/sparkleLook.ts — shared HDR sparkle defaults

export const SPARKLE_PALETTE = {
  colorAHex: 0xffffff,
  colorBHex: 0xffffff,
  colorCHex: 0xffffff,
  colorTravelM: 18,
} as const;

export const SPARKLE_LOOK = {
  sizeM: 0.035,
  hdr: 2,
  spin: 0.7,
} as const;

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

/** Per-system config before mapping to SparkleLookSettings. Guide uses particleSpreadM; others use spreadM. */
export interface SparkleLookSource {
  particleSizeM: number;
  particleIdle: number;
  particleHdr: number;
  particleSpin: number;
  breathAmount: number;
  breathSpeed: number;
  emissiveHex: number;
  colorBHex: number;
  colorCHex: number;
  colorTravelM: number;
  pulseSpeed: number;
  pulseSpacingM: number;
  pulseLengthM: number;
  spreadM?: number;
  particleSpreadM?: number;
}

export function toSparkleLook(
  src: SparkleLookSource,
  overrides?: Partial<SparkleLookSettings>,
  out?: SparkleLookSettings,
): SparkleLookSettings {
  const dest = out ?? ({} as SparkleLookSettings);
  dest.sizeM = src.particleSizeM;
  dest.spreadM = src.spreadM ?? src.particleSpreadM ?? 0;
  dest.idle = src.particleIdle;
  dest.hdr = src.particleHdr;
  dest.spin = src.particleSpin;
  dest.breathAmount = src.breathAmount;
  dest.breathSpeed = src.breathSpeed;
  dest.colorAHex = src.emissiveHex;
  dest.colorBHex = src.colorBHex;
  dest.colorCHex = src.colorCHex;
  dest.colorTravelM = src.colorTravelM;
  dest.pulseSpeed = src.pulseSpeed;
  dest.pulseSpacingM = src.pulseSpacingM;
  dest.pulseLengthM = src.pulseLengthM;
  if (overrides) Object.assign(dest, overrides);
  return dest;
}
