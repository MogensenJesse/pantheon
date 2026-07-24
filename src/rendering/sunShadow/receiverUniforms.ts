// src/rendering/sunShadow/receiverUniforms.ts — sun/shadow sync targets shared by world receivers
// Owned here so syncSunShadowReceivers does not import world/ (avoids barrel cycles).
import { Color, Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import {
  GRASS_SHADOW_FLOOR_DEFAULT,
  PROP_SHADOW_FLOOR_DEFAULT,
  WATER_SHADOW_FLOOR_DEFAULT,
} from './sunShadowProfiles';

/** Grass — fields written by {@link syncSunShadowReceivers}. */
export const grassSunReceiverUniforms = {
  uShadowFloor: uniform(GRASS_SHADOW_FLOOR_DEFAULT),
  uSunIntensity: uniform(0),
  uSunColor: uniform(new Color(0xffecd0)),
  uSunDirection: uniform(new Vector3(0.55, 0.75, 0.45).normalize()),
};

/** Map props — sun + player-glow fields written by {@link syncSunShadowReceivers}. */
export const propSunReceiverUniforms = {
  uShadowFloor: uniform(PROP_SHADOW_FLOOR_DEFAULT),
  uSunIntensity: uniform(0),
  uSunDirection: uniform(new Vector3(0.55, 0.75, 0.45).normalize()),
  uDaylight: uniform(VISUAL.sky.lightingCurve.nightDaylightFloor),
  uPlayerPosition: uniform(new Vector3()),
  uLightRadius: uniform(6),
  uLightIntensity: uniform(2.2),
};

/** Water — fields written by {@link syncSunShadowReceivers}. */
export const waterSunReceiverUniforms = {
  uShadowFloor: uniform(WATER_SHADOW_FLOOR_DEFAULT),
  uSunIntensity: uniform(0),
};
