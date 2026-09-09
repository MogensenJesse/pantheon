// src/world/water/sync/waterShoreSync.ts — live DEV + tod drive for shore-depth uniforms
import { Color } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { devDebugSettings, runtimeSettings } from '../../../core/GameState';
import { currentSunElevationDeg } from '../../../rendering/sunSpherical';
import { sampleTodColor } from '../../../rendering/tod/todBlend';
import type { WaterShoreUniforms } from '../material/waterShoreUniforms';

const _shallowColor = new Color();

/** Push devSettings + render-debug + tod shallow tint into shore TSL uniforms. */
export function syncWaterShoreUniforms(shore: WaterShoreUniforms, _daylight: number): void {
  const sd = runtimeSettings.water.shoreDepth;
  const shoreEnabled =
    sd.enabled && !(import.meta.env.DEV && devDebugSettings.renderDebug.disableShoreDepth);

  shore.uEnabled.value = shoreEnabled ? 1 : 0;
  shore.uAbsorption.value = sd.absorption;
  shore.uCoastFadeM.value = sd.coastFadeM;
  shore.uShallowDepthM.value = sd.shallowDepthM;
  shore.uRefractionDepthM.value = sd.refractionDepthM;
  shore.uShallowOverRefract.value = sd.shallowOverRefract;
  shore.uShadowOpacityBoost.value = sd.shadowOpacityBoost;
  shore.uRefractionStrength.value = sd.refractionStrength;
  shore.uRefractionOffset.value = sd.refractionOffset;
  shore.uRefractionOpacity.value = sd.refractionOpacity;
  shore.uMapBoundsFadeM.value = sd.mapBoundsFadeM;
  shore.uOpenOceanDepthM.value = sd.openOceanDepthM;

  const stops = runtimeSettings.water.stops ?? VISUAL.water.stops;
  sampleTodColor(
    {
      night: stops.night.shallowColor,
      goldenHour: stops.goldenHour.shallowColor,
      noon: stops.noon.shallowColor,
    },
    currentSunElevationDeg(),
    _shallowColor,
  );
  (shore.uShallowColor.value as Color).copy(_shallowColor);
}
