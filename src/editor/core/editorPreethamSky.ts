// src/editor/core/editorPreethamSky.ts — editor Preetham dome from the play day arc

import { Color } from 'three';
import { sampleLighting } from '../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import {
  getActiveSkyAtmosphereStops,
  mergeSkyWithDevOverrides,
} from '../../rendering/sky/skyDevOverrides';
import { blendSkyForReveal } from '../../rendering/sky/skyRevealBlend';
import { sampleTodColor } from '../../rendering/tod/todBlend';

const _tint = new Color();

/** Same Preetham scatter, exposure, and tint as play. AgX exposure is applied by the editor present. */
export function applyEditorPreethamSky(sky: SkySystemContext, elevationDeg: number): void {
  const params = mergeSkyWithDevOverrides(blendSkyForReveal(elevationDeg));
  const stops = getActiveSkyAtmosphereStops();
  sampleTodColor(
    {
      night: stops.night.tint,
      goldenHour: stops.goldenHour.tint,
      noon: stops.noon.tint,
    },
    elevationDeg,
    _tint,
  );
  sky.setSkyParams(params);
  sky.setSkyExposure(sampleLighting(elevationDeg).skyExposure);
  sky.setSkyTint(_tint);
}
