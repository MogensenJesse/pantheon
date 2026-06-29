// src/world/water/waterShoreSync.ts — live DEV + day/night drive for shore-depth uniforms
import { Color, MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import type { WaterShoreUniforms } from './waterShoreUniforms';

const NIGHT = VISUAL.sky.lightingCurve.nightDaylightFloor;
const _shallowColor = new Color();
const _shallowDay = new Color();

/** Push devSettings + render-debug + day/night shallow tint into shore TSL uniforms. */
export function syncWaterShoreUniforms(shore: WaterShoreUniforms, daylight: number): void {
  const sd = devSettings.water.shoreDepth;
  const shoreEnabled =
    sd.enabled && !(import.meta.env.DEV && devSettings.renderDebug.disableShoreDepth);

  shore.uEnabled.value = shoreEnabled ? 1 : 0;
  shore.uAbsorption.value = sd.absorption;
  shore.uCoastFadeM.value = sd.coastFadeM;
  shore.uShallowDepthM.value = sd.shallowDepthM;
  shore.uRefractionDepthM.value = sd.refractionDepthM;
  shore.uShadowOpacityBoost.value = sd.shadowOpacityBoost;
  shore.uRefractionStrength.value = sd.refractionStrength;
  shore.uRefractionOffset.value = sd.refractionOffset;
  shore.uRefractionOpacity.value = sd.refractionOpacity;
  shore.uFogBypassStrength.value = sd.fogBypassStrength;

  const t = MathUtils.smoothstep(daylight, NIGHT, 1);
  _shallowDay.set(sd.shallowColor);
  _shallowColor.set(sd.shallowColorNight).lerp(_shallowDay, t);
  shore.uShallowColor.value.copy(_shallowColor);
}
