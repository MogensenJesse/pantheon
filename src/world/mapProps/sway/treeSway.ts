// src/world/mapProps/sway/treeSway.ts — how a tree gives to the wind (pure: node-runnable)
//
// The CPU twin of `tsl/propSwayTsl.ts`: the same maths on numbers, so a check can prove what the shader must do
// (nothing at the foot, more with height, gentle, along the wind) without a GPU. Keep the two in step.
//
// A tree leans along the wind by `lean × height`, weighted by (height share) ^ power, so the trunk stays stiff
// and the crown moves. The lean is a gust wave that travels along the wind (the same wave at every distance
// band, so a tree never jumps when it changes level of detail) plus a smaller wobble across the wind. Near
// trees (lod0) also flutter.

import { props } from '../../../config/visual/props.ts';
import { clamp01, smoothstepEdges, TAU } from '../../../core/math/scalar.ts';

/**
 * The fixed shape of the gust and the flutter (not tuned in the DEV panel). The shader twin
 * (`tsl/propSwayTsl.ts`) takes these same numbers, so the two cannot drift apart.
 */
export const SWAY_SHAPE = {
  /** The faster, narrower gust wave: its phase runs at this multiple of the slow wave's, shifted across the wind. */
  FAST_RATE: 2.3,
  FAST_ACROSS: 0.7,
  FAST_OFFSET: 1.7,
  /** A vertex's flutter phase per metre of x, of z and of height. */
  VERTEX_X: 1.7,
  VERTEX_Z: 2.3,
  VERTEX_Y: 3.1,
  /** The along-wind flutter: a main wave and a second at a faster rate (`SECOND_RATE`) and phase (`SECOND_PHASE`). */
  MAIN_WEIGHT: 0.6,
  SECOND_WEIGHT: 0.4,
  SECOND_RATE: 1.7,
  SECOND_PHASE: 1.3,
  /** The across-wind flutter: its rate and phase against the main wave, and a fixed offset. */
  ACROSS_RATE: 1.3,
  ACROSS_PHASE: 0.8,
  ACROSS_OFFSET: 1.3,
  /** How much of the along-wind flutter lifts a vertex. */
  LIFT: 0.3,
} as const;

const S = SWAY_SHAPE;

/** The tuning numbers (the DEV panel moves the shader's copy of these). */
type SwayConfig = Omit<(typeof props)['sway'], 'species'>;

/** What one kind of tree needs to sway: its height and how much it gives. */
export interface TreeSway {
  /** Height of the model (m) and where its foot is, in model space. */
  heightM: number;
  footY: number;
  /** Species factors on the lean and on the flutter. */
  bend: number;
  flutter: number;
}

/** The sway of a tree asset by its key, or null for a prop that does not sway (rocks, buildings). */
export function swayForKey(key: string, heightM: number, footY = 0): TreeSway | null {
  if (!(heightM > props.sway.minHeightM)) return null;
  const species = props.sway.species.find((s) => key.startsWith(s.prefix));
  if (!species) return null;
  return { heightM, footY, bend: species.bend, flutter: species.flutter };
}

/** 0 at the foot, 1 at the top: how much of the lean a vertex at model height `y` takes. */
export function heightShare(y: number, sway: TreeSway): number {
  return clamp01((y - sway.footY) / sway.heightM);
}

export function swayWeight(y: number, sway: TreeSway, cfg: SwayConfig = props.sway): number {
  return heightShare(y, sway) ** cfg.heightPower;
}

/**
 * The gust at a place, 0..1: a broad wave travelling along the wind plus a faster, narrower one.
 * `along` and `across` are the place's distance along and across the wind (m), `clockS` the wind clock.
 */
export function gustAt(
  along: number,
  across: number,
  clockS: number,
  cfg: SwayConfig = props.sway,
): { gust: number; fast: number } {
  const k = TAU / cfg.waveLengthM;
  const phase = along * k - clockS * (TAU / cfg.periodS);
  const slow = Math.sin(phase) * 0.5 + 0.5;
  const fast =
    Math.sin(phase * S.FAST_RATE + across * k * S.FAST_ACROSS + S.FAST_OFFSET) * 0.5 + 0.5;
  return { gust: slow * cfg.gustSlowShare + fast * (1 - cfg.gustSlowShare), fast };
}

export interface SwayInput {
  /** The vertex: model height (m) and world position (m). */
  y: number;
  x: number;
  z: number;
  /** Unit wind direction (x, z), the wind clock (s) and the wind boost (1 = calm). */
  windX: number;
  windZ: number;
  clockS: number;
  boost: number;
  /** 0 = lod0 (flutters), 1 and 2 only lean. */
  lodBand?: 0 | 1 | 2;
  /** Distance from the orb (m): flutter rises close to it. Far away by default. */
  orbDistM?: number;
}

/** How far a vertex moves (m) in x, y and z. */
export function swayOffset(
  input: SwayInput,
  sway: TreeSway,
  cfg: SwayConfig = props.sway,
): { x: number; y: number; z: number } {
  const { windX, windZ, boost } = input;
  const perpX = -windZ;
  const perpZ = windX;
  const weight = swayWeight(input.y, sway, cfg);
  const along = input.x * windX + input.z * windZ;
  const across = input.x * perpX + input.z * perpZ;
  const { gust, fast } = gustAt(along, across, input.clockS, cfg);

  const scale = boost * sway.bend * sway.heightM * weight;
  const alongM = (cfg.baseLean + cfg.gustLean * gust) * scale;
  const sideM = (fast - 0.5) * cfg.gustLean * cfg.sideShare * scale;
  let x = windX * alongM + perpX * sideM;
  let y = 0;
  let z = windZ * alongM + perpZ * sideM;

  if ((input.lodBand ?? 0) === 0) {
    const share = heightShare(input.y, sway);
    const phase = input.x * S.VERTEX_X + input.z * S.VERTEX_Z + input.y * S.VERTEX_Y;
    const t = input.clockS * TAU * cfg.flutterHz;
    const fa =
      Math.sin(t + phase) * S.MAIN_WEIGHT +
      Math.sin(t * S.SECOND_RATE + phase * S.SECOND_PHASE) * S.SECOND_WEIGHT;
    const fb = Math.sin(t * S.ACROSS_RATE + phase * S.ACROSS_PHASE + S.ACROSS_OFFSET);
    const orb = 1 + cfg.orbGain * (1 - smoothstepEdges(0, cfg.orbRadiusM, input.orbDistM ?? 1e9));
    const flutterM = share ** 3 * cfg.flutterM * sway.flutter * boost * orb;
    x += (windX * fa + perpX * fb) * flutterM;
    y += fa * S.LIFT * flutterM;
    z += (windZ * fa + perpZ * fb) * flutterM;
  }
  return { x, y, z };
}
