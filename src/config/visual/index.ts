// src/config/visual/index.ts — assembled VISUAL look defaults

import { atmosphere } from './atmosphere';
import { bloom } from './bloom';
import { clouds } from './clouds';
import { dof } from './dof';
import { editor } from './editor';
import { godrays } from './godrays';
import { grass } from './grass';
import { player } from './player';
import { postfx } from './postfx';
import { props } from './props';
import { render } from './render';
import { shadows } from './shadows';
import { sky } from './sky';
import { terrain } from './terrain';
import { water } from './water';

export type {
  AaMethod,
  SunShadowFilterMode,
  UpscalingMethod,
  UpscalingSettings,
  WaterReflectClouds,
  WaterReflectProps,
  WaterTier,
} from './types';

/**
 * Canonical visual defaults (production + DEV panel).
 * Player orb illumination: `player`. Surface night glow receive muls:
 * `terrain.playerGlowMul`, `grass.playerGlowMul`, `props.playerGlowMul`.
 */
export const VISUAL = {
  atmosphere,
  shadows,
  sky,
  clouds,
  bloom,
  dof,
  player,
  godrays,
  postfx,
  render,
  water,
  terrain,
  props,
  grass,
  editor,
} as const;
