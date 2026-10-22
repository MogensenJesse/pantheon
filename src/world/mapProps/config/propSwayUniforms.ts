// src/world/mapProps/config/propSwayUniforms.ts — the live numbers behind tree sway (the DEV panel moves them)
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';

const S = VISUAL.props.sway;
const TAU = Math.PI * 2;

export const propSwayUniforms = {
  uBaseLean: uniform(S.baseLean),
  uGustLean: uniform(S.gustLean),
  uSideShare: uniform(S.sideShare),
  uHeightPower: uniform(S.heightPower),
  /** 2π / wavelength (rad per m) and 2π / period (rad per s) of the gust wave. */
  uWaveK: uniform(TAU / S.waveLengthM),
  uWaveOmega: uniform(TAU / S.periodS),
  uFlutterM: uniform(S.flutterM),
  /** 2π × flutter rate (rad per s). */
  uFlutterOmega: uniform(TAU * S.flutterHz),
  uOrbRadius: uniform(S.orbRadiusM),
  uOrbGain: uniform(S.orbGain),
};

/** The share of the gust that is the slow broad wave: fixed in the graph (a full reload to change). */
export const SWAY_GUST_SLOW_SHARE = S.gustSlowShare;
