// src/rendering/atmosphere/atmosphereTsl.ts — shared fog TSL (slab, aerial, sky mix, mixTowardFog)
import {
  cameraPosition,
  Fn,
  float,
  If,
  length,
  max,
  positionWorld,
  positionWorldDirection,
  smoothstep,
  vec2,
} from 'three/tsl';
import { heightSlabFogFactor } from './heightSlabFogTsl';

export { heightSlabFogFactor, heightSlabPathLength } from './heightSlabFogTsl';
export { mixTowardFog } from './mixTowardFogTsl';
export { applySkyHorizonHaze } from './skyHorizonHazeTsl';

type TslNode = any;
export type FogUniform = TslNode;

/**
 * Below this master / aerial strength, skip the matching TSL branch.
 * Must use TSL `If` + `toVar` — `select()` / mix still evaluates both sides in WGSL.
 */
const FOG_ACTIVE_EPS = 0.001;

/**
 * Sky/HDRI segment length (m). Optical path still caps at `valleyRayMaxM`.
 * Must be long enough to reach a low valley slab from a high ridge.
 */
const VALLEY_SKY_TRACE_M = 2200;

export interface ValleyFogGraphUniforms {
  uFogBase: FogUniform;
  uFogTop: FogUniform;
  uHazeDensity: FogUniform;
  uValleyRayMaxM: FogUniform;
  uValleyAmbientM: FogUniform;
  uValleyEdgeFadeM: FogUniform;
  uValleyObscurePower: FogUniform;
  uFogMaster: FogUniform;
  uAerialStartM: FogUniform;
  uAerialEndM: FogUniform;
  uAerialStrength: FogUniform;
}

export interface ValleyFogAreaNodes {
  nightArea: TslNode;
  skyVolume: TslNode;
  fogArea: TslNode;
}

/** Day XZ aerial + night Y-slab, combined as 1-(1-day)*(1-night). Sky uses a far fake-hit. */
export function createValleyFogAreaNodes(u: ValleyFogGraphUniforms): ValleyFogAreaNodes {
  const nightVolumeAt = (endP: TslNode) => {
    return heightSlabFogFactor(
      cameraPosition,
      endP,
      u.uFogBase,
      u.uFogTop,
      u.uHazeDensity,
      u.uValleyRayMaxM,
      u.uValleyAmbientM,
      u.uValleyEdgeFadeM,
      u.uValleyObscurePower,
    ).mul(u.uFogMaster);
  };

  const nightArea = Fn(() => {
    const out = float(0).toVar();
    If(u.uFogMaster.greaterThan(FOG_ACTIVE_EPS), () => {
      out.assign(nightVolumeAt(positionWorld));
    });
    return out;
  })();

  const skyVolume = Fn(() => {
    const out = float(0).toVar();
    If(u.uFogMaster.greaterThan(FOG_ACTIVE_EPS), () => {
      const endP = cameraPosition.add(positionWorldDirection.mul(float(VALLEY_SKY_TRACE_M)));
      out.assign(nightVolumeAt(endP));
    });
    return out;
  })();

  const dayArea = Fn(() => {
    const out = float(0).toVar();
    If(u.uAerialStrength.greaterThan(FOG_ACTIVE_EPS), () => {
      const camXZ = vec2(cameraPosition.x, cameraPosition.z);
      const worldXZ = vec2(positionWorld.x, positionWorld.z);
      const dist = length(worldXZ.sub(camXZ));
      const endM = max(u.uAerialEndM, u.uAerialStartM.add(float(1)));
      out.assign(smoothstep(u.uAerialStartM, endM, dist).mul(u.uAerialStrength).saturate());
    });
    return out;
  })();

  const fogArea = dayArea.oneMinus().mul(nightArea.oneMinus()).oneMinus();
  return { nightArea, skyVolume, fogArea };
}
