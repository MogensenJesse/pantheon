// src/world/water/waves/waveMath.ts — plain-number side of the waves: the swell table and height (twin of tsl/waterWavesTsl.ts) and the shore swash curves (twin of tsl/waterRunUpTsl.ts and tsl/waterFoamTsl.ts and terrain/material/waterWetnessTsl.ts). Checked by scripts/checks/water.
import { clamp01, smoothstepEdges as smoothstep } from '../../../core/math/scalar.ts';

const GRAVITY = 9.81;
/** Phase offsets between components: the golden angle, so no two crests line up for long. */
const PHASE_STEP = 2.399963;
/**
 * The swell's shoaling depth is at least this many swell heights. A smoothstep climbs at most 1.5 x its height per depth,
 * so 1.5 / 2.5 = 0.6: the trough can never take more than 60 % of the water above a point, and the swell never moves
 * the waterline (that is the swash's job).
 */
export const SHOAL_DEPTH_PER_HEIGHT = 2.5;

export interface SwellComponent {
  wavelengthM: number;
  share: number;
}

export interface SwellConfig {
  enabled: boolean;
  calmHeightM: number;
  stormHeightM: number;
  fullEnergyBoost: number;
  speedScale: number;
  steepness: number;
  shoalDepthM: number;
  components: readonly SwellComponent[];
  fadeFromWavelengths: number;
  fadeToWavelengths: number;
  whitecap: { crestFrom: number; crestTo: number; energyFrom: number; amount: number };
  /** The swell grows with the distance to the nearest shore: 1 x within `fromM`, `gain` x from `toM`. */
  openSea: { gain: number; fromM: number; toM: number };
}

export interface ShoreConfig {
  enabled: boolean;
  periodS: number;
  breakDistM: number;
  trailM: number;
  fringeM: number;
  alongShoreM: number;
  wobble: number;
  calmShare: number;
  stormMul: number;
  swashHeightM: number;
  riseShare: number;
  backwashShare: number;
  recedeShare: number;
  lobeM: number;
  lobeShare: number;
  dampHeightM: number;
  dryShare: number;
}

/** One wave of the swell, ready for either side: wave number, angular speed, share of the height (they add to 1) and phase. */
export interface SwellWave {
  k: number;
  omega: number;
  amp: number;
  phase: number;
}

/** 1 on the open sea down to `share` in enclosed water (lake and ponds): `lake` is the baked field's 0..1 lake share. */
export function lakeMul(lake: number, share: number): number {
  return 1 + (share - 1) * clamp01(lake);
}

/** 0 in calm weather (wind boost 1) up to 1 at `fullBoost`. */
export function waveEnergy(boost: number, fullBoost: number): number {
  return clamp01((boost - 1) / Math.max(fullBoost - 1, 1e-4));
}

/** Total swell height (m, the components added): the most any point rises above the mean level. */
export function swellTotalHeightM(cfg: SwellConfig, energy: number): number {
  if (!cfg.enabled) return 0;
  return cfg.calmHeightM + (cfg.stormHeightM - cfg.calmHeightM) * clamp01(energy);
}

/** The tallest the swell gets anywhere (m): the near-land height times the open-sea gain (the check bounds heights by it). */
export function swellMaxHeightM(cfg: SwellConfig, energy: number): number {
  return swellTotalHeightM(cfg, energy) * Math.max(1, cfg.openSea.gain);
}

/** 1 near land, `openSea.gain` far from it: the swell grows with the distance to the nearest shore (`shoreDistM`). */
export function openSeaGrow(cfg: SwellConfig, shoreDistM: number): number {
  const { gain, fromM, toM } = cfg.openSea;
  return 1 + (gain - 1) * smoothstep(fromM, Math.max(toM, fromM + 1e-3), shoreDistM);
}

/** The one table the shader and the CPU both read; shares are normalised, speed is deep-water gravity waves times `speedScale`. */
export function swellTable(cfg: SwellConfig): SwellWave[] {
  const total = cfg.components.reduce((s, c) => s + c.share, 0) || 1;
  return cfg.components.map((c, i) => {
    const k = (2 * Math.PI) / c.wavelengthM;
    return {
      k,
      omega: Math.sqrt(GRAVITY * k) * cfg.speedScale,
      amp: c.share / total,
      phase: i * PHASE_STEP,
    };
  });
}

/** The depth (m) at which the swell is at full height: `shoalDepthM`, or 2.5 swell heights if that is more. */
export function effectiveShoalDepthM(cfg: SwellConfig, totalHeightM: number): number {
  return Math.max(cfg.shoalDepthM, SHOAL_DEPTH_PER_HEIGHT * totalHeightM);
}

/** 0 at zero depth up to 1 at `shoalDepthM`: the swell is gone where the water ends. */
export function shoalFactor(depthM: number, shoalDepthM: number): number {
  return smoothstep(0, Math.max(shoalDepthM, 1e-4), depthM);
}

/** 1 near the camera, 0 beyond `fadeTo` wavelengths: a component the mesh cannot resolve is switched off. */
export function distanceFade(distM: number, wavelengthM: number, cfg: SwellConfig): number {
  return (
    1 -
    smoothstep(cfg.fadeFromWavelengths * wavelengthM, cfg.fadeToWavelengths * wavelengthM, distM)
  );
}

/**
 * Height (m above the mean level) of the swell at clock `t`, at a point `shoreDistM` from the nearest shore (the baked field,
 * `shoreDistanceAt`) over water `depthM` deep, `distM` from the camera. The swell travels toward the shore, so its phase is
 * the distance to it. Twin of the vertex shader without its horizontal shift (the shift moves a point by at most
 * `steepness * height`, a few centimetres against a 0.25 to 1.1 m swell). `calm` scales the height (enclosed water:
 * `lakeMul(lake, share)`).
 */
export function swellHeightAt(
  cfg: SwellConfig,
  table: readonly SwellWave[],
  shoreDistM: number,
  t: number,
  depthM: number,
  energy: number,
  distM = 0,
  calm = 1,
): number {
  // A lake only gets lower waves (`calm`), never a shorter shoal. The open sea (`grow`) stretches the shoaling depth with the
  // height, so the water over a point stays at least 40 % of its depth wherever the swell is.
  const height = swellTotalHeightM(cfg, energy);
  const grow = openSeaGrow(cfg, shoreDistM);
  const total =
    height * grow * calm * shoalFactor(depthM, effectiveShoalDepthM(cfg, height) * grow);
  if (total <= 0) return 0;
  let h = 0;
  for (let i = 0; i < table.length; i++) {
    const w = table[i];
    const fade = distanceFade(distM, cfg.components[i].wavelengthM, cfg);
    h += w.amp * fade * Math.sin(-w.k * shoreDistM - w.omega * t + w.phase);
  }
  return total * h;
}

/** How much of a crest turns to foam: 0 until the energy passes `energyFrom`, up to `amount` in a full storm. */
export function whitecapStrength(cfg: SwellConfig, energy: number): number {
  if (!cfg.enabled) return 0;
  return cfg.whitecap.amount * smoothstep(cfg.whitecap.energyFrom, 1, energy);
}

/** What the shore shaders read as uniforms, from the config and the energy (0..1). */
export interface ShoreDerived {
  breakM: number;
  /** Swash height (m above the mean level), widened by the storm. */
  swashH: number;
  foamAmount: number;
  dampH: number;
  /** Seaward reach (m of depth) of the raised sea at the shore: it is 0 deeper than this. */
  seaW: number;
  /** Heights (m above or below the mean level) beyond which the terrain is neither wet nor reached by the swash. */
  gateH: number;
}

export function shoreDerived(cfg: ShoreConfig, energy: number): ShoreDerived {
  const e = clamp01(energy);
  const widen = 1 + (cfg.stormMul - 1) * e;
  const swashH = cfg.swashHeightM * widen;
  return {
    breakM: cfg.breakDistM * widen,
    swashH,
    foamAmount: cfg.enabled ? cfg.calmShare + (1 - cfg.calmShare) * e : 0,
    dampH: Math.min(cfg.dampHeightM, swashH),
    seaW: 1.5 * swashH,
    gateH: 1.5 * swashH + 0.05,
  };
}

/** Where a front is (m of water between it and the real waterline) at `phase` of its cycle: born at the break line, fast first and slowing, at the waterline when the uprush starts (`1 - riseShare`). */
export function shoreFrontM(phase: number, breakM: number, riseShare: number): number {
  const t = clamp01(phase / Math.max(1 - riseShare, 1e-4));
  return breakM * (1 - t) * (1 - t);
}

/** The uprush that ends a front's run (1 - (1 - u)^2 over the last `riseShare` of the cycle): 0..1. */
export function uprush01(phase: number, riseShare: number): number {
  const u = clamp01((phase - (1 - riseShare)) / Math.max(riseShare, 1e-4));
  return 1 - (1 - u) * (1 - u);
}

/** 0..1: how high the swash is at `phase`: the uprush, then the backwash falling (squared) over `backwashShare`. */
export function edgePulse(phase: number, riseShare: number, backwashShare: number): number {
  const fall = clamp01(1 - phase / Math.max(backwashShare, 1e-4));
  return Math.max(uprush01(phase, riseShare), fall * fall);
}

/** 0..1: how high the sand is wet: climbs with the uprush, then dries linearly over `dryShare` of the next cycle. */
export function wetPulse(phase: number, riseShare: number, dryShare: number): number {
  const decay = clamp01(1 - phase / Math.max(dryShare, 1e-4));
  return Math.max(uprush01(phase, riseShare), decay);
}

/** The two fronts are half a cycle apart: the swash at a place and time given the phase of the first one. */
export function swashPulse(phase: number, cfg: ShoreConfig): number {
  const p2 = (phase + 0.5) % 1;
  return Math.max(
    edgePulse(phase, cfg.riseShare, cfg.backwashShare),
    edgePulse(p2, cfg.riseShare, cfg.backwashShare),
  );
}

/** Vertical offset (m, + up) the swash puts on the sea at a point `depthM` deep (mean level): 1 at the waterline, 0 deeper than `seaW` and higher than the swash can climb. */
export function swashProfile(depthM: number, d: ShoreDerived): number {
  const sea = 1 - smoothstep(0, Math.max(d.seaW, 1e-4), depthM);
  const land = 1 - smoothstep(0.5 * d.swashH, Math.max(d.swashH, 1e-4), -depthM);
  return sea * land;
}

/** The sea's offset at the shore (m above the mean level): negative between swashes (the edge retreats), `lobe` 0..1 is the patchiness. */
export function runUpM(
  phase: number,
  depthM: number,
  d: ShoreDerived,
  cfg: ShoreConfig,
  lobe = 1,
): number {
  const lobeMul = 1 - cfg.lobeShare + cfg.lobeShare * clamp01(lobe);
  return d.swashH * (swashPulse(phase, cfg) - cfg.recedeShare) * lobeMul * swashProfile(depthM, d);
}

/** Height (m above the mean level) up to which the sand is wet at `phase`: between `dampH` and the top of the swash. */
export function wetHeightM(phase: number, d: ShoreDerived, cfg: ShoreConfig): number {
  const p2 = (phase + 0.5) % 1;
  const reach = Math.max(
    wetPulse(phase, cfg.riseShare, cfg.dryShare),
    wetPulse(p2, cfg.riseShare, cfg.dryShare),
  );
  const peak = d.swashH * (1 - cfg.recedeShare) * 1.1;
  return d.dampH + (peak - d.dampH) * reach;
}
