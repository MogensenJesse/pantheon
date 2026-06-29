// src/world/mapProps/propGroundContactUniforms.ts — height-map wiring + VISUAL sync for ground contact
import type { DataTexture } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { propShadowUniforms } from './mapPropShadowUniforms';

export interface PropGroundContactInputs {
  heightMap: DataTexture;
  worldSize: number;
  heightScale: number;
}

/** Bind macro height texture after terrain build (before prop instancing). */
export function initPropGroundContact(inputs: PropGroundContactInputs): void {
  propShadowUniforms.uHeightTex.value = inputs.heightMap;
  propShadowUniforms.uWorldSize.value = inputs.worldSize;
  propShadowUniforms.uHeightScale.value = inputs.heightScale;
  syncPropGroundContactFromVisual();
}

/** Restore ground-contact tunables from VISUAL.props.groundContact. */
export function syncPropGroundContactFromVisual(): void {
  const gc = VISUAL.props.groundContact;
  propShadowUniforms.uGroundContactEnabled.value = gc.enabled ? 1 : 0;
  propShadowUniforms.uFadeHeightM.value = gc.fadeHeightM;
  propShadowUniforms.uDarkenMax.value = gc.darkenMax;
  propShadowUniforms.uTintStrength.value = gc.tintStrength;
  propShadowUniforms.uBarkContactStrength.value = gc.barkStrength;
  propShadowUniforms.uFoliageContactStrength.value = gc.foliageStrength;
  propShadowUniforms.uDefaultContactStrength.value = gc.defaultStrength;
}
