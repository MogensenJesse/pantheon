// src/config/visual/index.ts — assembled VISUAL look defaults

import { atmosphere } from './atmosphere.ts';
import { bloom } from './bloom.ts';
import { clouds } from './clouds.ts';
import { dof } from './dof.ts';
import { editor } from './editor.ts';
import { godrays } from './godrays.ts';
import { grass } from './grass.ts';
import { guideLine } from './guideLine.ts';
import { player } from './player.ts';
import { postfx } from './postfx.ts';
import { props } from './props.ts';
import { render } from './render.ts';
import { shadows } from './shadows.ts';
import { sky } from './sky.ts';
import { terrain } from './terrain.ts';
import { water } from './water.ts';

export type {
  AaMethod,
  MsaaSamples,
  UpscalingMethod,
  UpscalingSettings,
  WaterReflectClouds,
  WaterReflectProps,
  WaterTier,
} from './types.ts';

/**
 * Canonical visual defaults (production + DEV panel).
 * Player orb illumination: `player`. Surface night glow receive muls:
 * `terrain.playerGlowMul`, `grass.playerGlowMul`, `props.playerGlowMul`.
 * Path guide ribbon: `guideLine`.
 */
export const VISUAL = {
  atmosphere,
  shadows,
  sky,
  clouds,
  bloom,
  dof,
  player,
  guideLine,
  godrays,
  postfx,
  render,
  water,
  terrain,
  props,
  grass,
  editor,
} as const;
