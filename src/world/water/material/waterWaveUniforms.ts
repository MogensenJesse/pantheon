// src/world/water/material/waterWaveUniforms.ts — shared wave uniforms: the swell, the swash (the moving waterline), shore foam and wet sand
import { Color, Vector2 } from 'three';
import { texture, uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import { createShoreFieldPlaceholder } from '../waves/shoreFieldTexture';
import { shoreDerived } from '../waves/waveMath';

type WaterUniform = any;

/** One swell component as the vertex shader reads it (written every frame from `swellTable`, so DEV edits apply live). */
export interface SwellComponentUniforms {
  uK: WaterUniform;
  uOmega: WaterUniform;
  /** Share of the total height (the shares add to 1). */
  uAmp: WaterUniform;
  uPhase: WaterUniform;
  /** Distances (m) from the camera between which the component fades out. */
  uFade: WaterUniform;
}

export interface SwellUniforms {
  /** Total height (m) of the swell right now (0 = flat sea). */
  uHeightM: WaterUniform;
  /** Depth (m) at which the swell is at full height (the effective shoaling depth). */
  uShoalM: WaterUniform;
  uSteepness: WaterUniform;
  /** The swell grows with the distance to the nearest shore: gain far out, and the distances (m) it starts and is full at. */
  uOpenGain: WaterUniform;
  uOpenFromM: WaterUniform;
  uOpenToM: WaterUniform;
  /** Crest height share (0..1) where foam starts and is full. */
  uWhiteCrest: WaterUniform;
  /** Whitecap strength 0..1 (already scaled by the energy). */
  uWhiteAmount: WaterUniform;
  components: SwellComponentUniforms[];
}

/** The vertex shader unrolls this many components; extra components in the config are ignored, missing ones are silent. */
const SWELL_SHADER_COMPONENTS = 4;

export interface WaterWaveUniforms {
  swell: SwellUniforms;
  /** The baked shore field (distance to the nearest shore + the way to it): the swell travels toward the shore. Bound by the map builder. */
  uShoreField: WaterUniform;
  /** World Y of the mean water level: written by the map builder (`applyWaterY`); the shore-depth uniforms share this node. */
  uWaterY: WaterUniform;
  uFoamColor: WaterUniform;
  uShoreSlopeStepM: WaterUniform;
  uShoreMaxSlope: WaterUniform;
  /** 1 = shore waves on (the map editor sets 0: a static level). */
  uShoreEnabled: WaterUniform;
  /** Foam strength 0..1 (calm to storm; 0 = no foam). */
  uShoreFoamAmount: WaterUniform;
  uShorePeriodS: WaterUniform;
  /** Metres of water from the waterline where a front is born (widened by the storm). */
  uShoreBreakM: WaterUniform;
  /** The swash: height (m above the mean level, storm-widened), the share of a cycle of its uprush and of its backwash, and how far below the mean level it drops between swashes (share of the height). */
  uShoreSwashH: WaterUniform;
  uShoreRiseShare: WaterUniform;
  uShoreBackwash: WaterUniform;
  uShoreRecede: WaterUniform;
  /** Seaward reach of the raised sea (m of depth), and the height band (m) around the mean level where the terrain can be wet. */
  uShoreSeaW: WaterUniform;
  uShoreGateH: WaterUniform;
  uShoreLobeM: WaterUniform;
  uShoreLobeShare: WaterUniform;
  uShoreTrailM: WaterUniform;
  uShoreFringeM: WaterUniform;
  uShoreAlongM: WaterUniform;
  uShoreWobble: WaterUniform;
  /** Height (m) the sand always stays damp up to. */
  uShoreDampH: WaterUniform;
  uShoreDryShare: WaterUniform;
  uWetSandDarken: WaterUniform;
  /** How far (m) the water geometry rides above the exact surface over the shallows (hides the grid's cut through the terrain). */
  uShoreEdgeLiftM: WaterUniform;
  /** The lighter band of moist sand above the swash: how far inland it reaches (horizontal m), the height cap (m above the mean level) and its darkening. */
  uShoreMoistM: WaterUniform;
  uShoreMoistH: WaterUniform;
  uMoistDarken: WaterUniform;
  /** Enclosed water (baked lake share 1) as a share of the open sea: swell height, swash height and reach, foam, ripple strength. */
  uLakeSwellShare: WaterUniform;
  uLakeSwashShare: WaterUniform;
  uLakeFoamShare: WaterUniform;
  uLakeRippleShare: WaterUniform;
  /** Mirrors shoreDepth.fogBypassStrength — water setupFog skip at the coast. */
  uShoreFogBypass: WaterUniform;
}

const shore = VISUAL.water.waves.shore;
const calm = shoreDerived(shore, 0);

export const waterWaveUniforms: WaterWaveUniforms = {
  swell: {
    uHeightM: uniform(0),
    uShoalM: uniform(VISUAL.water.waves.swell.shoalDepthM),
    uSteepness: uniform(VISUAL.water.waves.swell.steepness),
    uOpenGain: uniform(VISUAL.water.waves.swell.openSea.gain),
    uOpenFromM: uniform(VISUAL.water.waves.swell.openSea.fromM),
    uOpenToM: uniform(VISUAL.water.waves.swell.openSea.toM),
    uWhiteCrest: uniform(new Vector2(0.65, 1)),
    uWhiteAmount: uniform(0),
    components: Array.from({ length: SWELL_SHADER_COMPONENTS }, () => ({
      uK: uniform(0),
      uOmega: uniform(0),
      uAmp: uniform(0),
      uPhase: uniform(0),
      uFade: uniform(new Vector2(1, 2)),
    })),
  },
  uShoreField: texture(createShoreFieldPlaceholder()),
  uWaterY: uniform(0),
  uFoamColor: uniform(new Color(shore.foamColor)),
  uShoreSlopeStepM: uniform(shore.shoreSlopeStepM),
  uShoreMaxSlope: uniform(shore.shoreMaxSlope),
  uShoreEnabled: uniform(shore.enabled ? 1 : 0),
  uShoreFoamAmount: uniform(calm.foamAmount),
  uShorePeriodS: uniform(shore.periodS),
  uShoreBreakM: uniform(calm.breakM),
  uShoreSwashH: uniform(calm.swashH),
  uShoreRiseShare: uniform(shore.riseShare),
  uShoreBackwash: uniform(shore.backwashShare),
  uShoreRecede: uniform(shore.recedeShare),
  uShoreSeaW: uniform(calm.seaW),
  uShoreGateH: uniform(calm.gateH),
  uShoreLobeM: uniform(shore.lobeM),
  uShoreLobeShare: uniform(shore.lobeShare),
  uShoreTrailM: uniform(shore.trailM),
  uShoreFringeM: uniform(shore.fringeM),
  uShoreAlongM: uniform(shore.alongShoreM),
  uShoreWobble: uniform(shore.wobble),
  uShoreDampH: uniform(calm.dampH),
  uShoreDryShare: uniform(shore.dryShare),
  uWetSandDarken: uniform(shore.wetSandDarken),
  uShoreEdgeLiftM: uniform(VISUAL.water.waves.mesh.edgeLiftM),
  uShoreMoistM: uniform(shore.moistWidthM),
  uShoreMoistH: uniform(shore.moistHeightM),
  uMoistDarken: uniform(shore.moistDarken),
  uLakeSwellShare: uniform(VISUAL.water.waves.lake.swellShare),
  uLakeSwashShare: uniform(VISUAL.water.waves.lake.swashShare),
  uLakeFoamShare: uniform(VISUAL.water.waves.lake.foamShare),
  uLakeRippleShare: uniform(VISUAL.water.waves.lake.rippleShare),
  uShoreFogBypass: uniform(VISUAL.water.shoreDepth.fogBypassStrength),
};

/** Map editor — static water level reference, no waves and no shore foam. */
export function initWaterWaveEditorPreview(waterY: number): void {
  waterWaveUniforms.uWaterY.value = waterY;
  waterWaveUniforms.uShoreEnabled.value = 0;
  waterWaveUniforms.uShoreFoamAmount.value = 0;
  waterWaveUniforms.swell.uHeightM.value = 0;
  waterWaveUniforms.swell.uWhiteAmount.value = 0;
}
