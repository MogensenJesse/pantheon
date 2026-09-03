// src/rendering/atmosphere/atmosphereTsl.ts — shared fog TSL (slab, aerial, sky mix, mixTowardFog)
import {
  abs,
  cameraPosition,
  Fn,
  float,
  If,
  length,
  max,
  mix,
  positionWorld,
  positionWorldDirection,
  smoothstep,
  vec2,
} from 'three/tsl';
import { terrainMapUv } from '../../map/mapUvTsl';
import { INLAND_DIST_ENCODE_M } from '../../map/oceanInlandMask';
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

/**
 * Horizon inland sample (m). Do not use `VALLEY_SKY_TRACE_M` — 2 km almost
 * always clamps to the map edge (ocean) and zeros the under-ceiling sky veil.
 * Zenith uses camera XZ; horizon mixes toward this look-ahead.
 */
const VALLEY_SKY_INLAND_LOOK_M = 180;

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
  uInlandTex: FogUniform;
  uWorldSize: FogUniform;
  uInlandStartM: FogUniform;
  uInlandEndM: FogUniform;
}

export interface ValleyFogAreaNodes {
  nightArea: TslNode;
  skyVolume: TslNode;
  fogArea: TslNode;
}

/** Day XZ aerial + night Y-slab, combined as 1-(1-day)*(1-night). Sky uses a far fake-hit. */
export function createValleyFogAreaNodes(u: ValleyFogGraphUniforms): ValleyFogAreaNodes {
  const inlandTAt = (worldPos: TslNode) => {
    const xz = vec2(worldPos.x, worldPos.z);
    const distM = u.uInlandTex
      .sample(terrainMapUv(u.uWorldSize, xz))
      .r.mul(float(INLAND_DIST_ENCODE_M));
    const endM = max(u.uInlandEndM, u.uInlandStartM.add(float(1)));
    return smoothstep(u.uInlandStartM, endM, distM);
  };

  const nightVolumeAt = (endP: TslNode, inlandPos: TslNode) => {
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
    )
      .mul(u.uFogMaster)
      .mul(inlandTAt(inlandPos));
  };

  const nightArea = Fn(() => {
    const out = float(0).toVar();
    If(u.uFogMaster.greaterThan(FOG_ACTIVE_EPS), () => {
      out.assign(nightVolumeAt(positionWorld, positionWorld));
    });
    return out;
  })();

  const skyVolume = Fn(() => {
    const out = float(0).toVar();
    If(u.uFogMaster.greaterThan(FOG_ACTIVE_EPS), () => {
      const endP = cameraPosition.add(positionWorldDirection.mul(float(VALLEY_SKY_TRACE_M)));
      const lookP = cameraPosition.add(positionWorldDirection.mul(float(VALLEY_SKY_INLAND_LOOK_M)));
      const horizonW = float(1).sub(
        smoothstep(float(0.12), float(0.5), abs(positionWorldDirection.y)),
      );
      const inlandPos = mix(cameraPosition, lookP, horizonW);
      out.assign(nightVolumeAt(endP, inlandPos));
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
