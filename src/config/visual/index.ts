// src/config/visual/index.ts — assembled VISUAL look defaults

import { atmosphere } from './atmosphere.ts';
import { bloom } from './bloom.ts';
import { dof } from './dof.ts';
import { editor } from './editor.ts';
import { energyOrb } from './energyOrb.ts';
import { godrays } from './godrays.ts';
import { grass } from './grass.ts';
import { guideLine } from './guideLine.ts';
import { organicOrb } from './organicOrb.ts';
import { player } from './player.ts';
import { postfx } from './postfx.ts';
import { props } from './props.ts';
import { render } from './render.ts';
import { shadows } from './shadows.ts';
import { sky } from './sky.ts';
import { terrain } from './terrain.ts';
import { tod } from './tod.ts';
import { water } from './water.ts';

export type { TodStopId } from './tod.ts';
export { TOD_STOP_LABELS, TOD_STOPS } from './tod.ts';
export type {
  AaMethod,
  MsaaSamples,
  UpscalingMethod,
  UpscalingSettings,
  WaterReflectProps,
  WaterTier,
} from './types.ts';

/** Canonical visual defaults. Surface glow muls: terrain/grass/props.playerGlowMul. */
export const VISUAL = {
  tod,
  atmosphere,
  shadows,
  sky,
  bloom,
  dof,
  player,
  organicOrb,
  guideLine,
  energyOrb,
  godrays,
  postfx,
  render,
  water,
  terrain,
  props,
  grass,
  editor,
} as const;
