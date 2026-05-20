// src/world/terrain/TerrainSplatMaterial.ts
import {
  Color,
  type Camera,
  type AmbientLight,
  type DirectionalLight,
  ShaderMaterial,
  Vector3,
} from 'three';
import { PHASE0 } from '../../config/phase0';
import { getJourneyPathShaderSegments } from '../JourneyPath';
import { WORLD } from '../WorldConfig';
import {
  biomeSplatFragmentShader,
  biomeSplatVertex,
  getBiomeSplatThresholds,
} from './biomeSplat';
import type { TerrainTextureSet } from './loadTerrainTextures';

const _sunDir = new Vector3();

export function createTerrainSplatMaterial(textures: TerrainTextureSet): ShaderMaterial {
  const thresholds = getBiomeSplatThresholds();
  const { shore, forest, hills, rock, path } = textures;
  const pathSegs = getJourneyPathShaderSegments();
  const pathInner = WORLD.JOURNEY.PATH_SURFACE.WIDTH * 0.5;
  const pathOuter = pathInner + WORLD.JOURNEY.PATH_SURFACE.BLEND_SOFT;

  return new ShaderMaterial({
    uniforms: {
      uShore: { value: shore.color },
      uShoreNorm: { value: shore.normal },
      uShoreOrm: { value: shore.orm },
      uShoreDisp: { value: shore.displacement },
      uLandDisp: { value: forest.displacement },

      uForest: { value: forest.color },
      uForestNorm: { value: forest.normal },
      uForestOrm: { value: forest.orm },

      uHills: { value: hills.color },
      uHillsNorm: { value: hills.normal },
      uHillsOrm: { value: hills.orm },

      uRock: { value: rock.color },
      uRockNorm: { value: rock.normal },
      uRockOrm: { value: rock.orm },

      uPath: { value: path.color },
      uPathDisp: { value: path.displacement },
      uPathRoughness: { value: WORLD.JOURNEY.PATH_SURFACE.ROUGHNESS },
      uPathAo: { value: WORLD.JOURNEY.PATH_SURFACE.AO },
      uPathTint: { value: new Color(WORLD.JOURNEY.PATH_SURFACE.COLOR) },
      uPathSegCount: { value: pathSegs.count },
      uPathSegA: { value: pathSegs.segA },
      uPathSegB: { value: pathSegs.segB },
      uPathBlendInner: { value: pathInner },
      uPathBlendOuter: { value: pathOuter },

      uRepeat: { value: PHASE0.TERRAIN_TEXTURE_REPEAT },
      uDispScale: { value: PHASE0.TERRAIN_DISPLACEMENT_SCALE },
      uWaterMax: { value: thresholds.waterMax },
      uShoreMax: { value: thresholds.shoreMax },
      uForestMax: { value: thresholds.forestMax },
      uHillsMax: { value: thresholds.hillsMax },
      uBlendWidth: { value: thresholds.blendWidth },
      uSlopeRockStart: { value: PHASE0.TERRAIN_SLOPE_ROCK_START },
      uNormalStrength: { value: PHASE0.TERRAIN_NORMAL_STRENGTH },
      uAoStrength: { value: PHASE0.TERRAIN_AO_STRENGTH },
      uSpecularStrength: { value: PHASE0.TERRAIN_SPECULAR_STRENGTH },

      uSunDirection: { value: new Vector3(0.55, 0.75, 0.45).normalize() },
      uSunColor: { value: new Color(0xffecd0) },
      uSunIntensity: { value: 0 },
      uAmbientColor: { value: new Color(0xe8dfc8) },
      uAmbientIntensity: { value: 0.04 },
      uViewCamPos: { value: new Vector3() },
    },
    vertexShader: biomeSplatVertex,
    fragmentShader: biomeSplatFragmentShader,
    lights: false,
  });
}

export function syncTerrainSplatLighting(
  material: ShaderMaterial,
  sun: DirectionalLight,
  ambient: AmbientLight,
  camera: Camera,
): void {
  _sunDir.copy(sun.position).sub(sun.target.position).normalize();
  material.uniforms['uSunDirection'].value.copy(_sunDir);
  (material.uniforms['uSunColor'].value as Color).set(sun.color);
  material.uniforms['uSunIntensity'].value = sun.intensity;
  (material.uniforms['uAmbientColor'].value as Color).set(ambient.color);
  material.uniforms['uAmbientIntensity'].value = ambient.intensity;
  material.uniforms['uViewCamPos'].value.copy(camera.position);
}

export function disposeTerrainSplatMaterial(material: ShaderMaterial): void {
  material.dispose();
}
