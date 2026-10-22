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

const TAU = Math.PI * 2;

/** The tuning numbers (the DEV panel moves the shader's copy of these). */
export type SwayConfig = Omit<(typeof props)['sway'], 'species'>;

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
  if (!(heightM > 0.5)) return null;
  const species = props.sway.species.find((s) => key.startsWith(s.prefix));
  if (!species) return null;
  return { heightM, footY, bend: species.bend, flutter: species.flutter };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

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
  const fast = Math.sin(phase * 2.3 + across * k * 0.7 + 1.7) * 0.5 + 0.5;
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
    const phase = input.x * 1.7 + input.z * 2.3 + input.y * 3.1;
    const t = input.clockS * TAU * cfg.flutterHz;
    const fa = Math.sin(t + phase) * 0.6 + Math.sin(t * 1.7 + phase * 1.3) * 0.4;
    const fb = Math.sin(t * 1.3 + phase * 0.8 + 1.3);
    const orb = 1 + cfg.orbGain * (1 - smoothstep(0, cfg.orbRadiusM, input.orbDistM ?? 1e9));
    const flutterM = share ** 3 * cfg.flutterM * sway.flutter * boost * orb;
    x += (windX * fa + perpX * fb) * flutterM;
    y += fa * 0.3 * flutterM;
    z += (windZ * fa + perpZ * fb) * flutterM;
  }
  return { x, y, z };
}
