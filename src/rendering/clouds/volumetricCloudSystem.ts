// src/rendering/clouds/volumetricCloudSystem.ts â€” webgpu-clouds host wrapper
import { Color, type PerspectiveCamera, Vector2, Vector3 } from 'three';
import type { TextureNode } from 'three/webgpu';
import { type CloudsNode, clouds, compositeClouds } from 'webgpu-clouds';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import type { TslNode } from '../postfx/tslNode';

const _sunDir = new Vector3(0.4, 0.8, 0.2).normalize();
const _sunIrr = new Vector3();
const _skyIrr = new Vector3();
const _tmpColor = new Color();

/** CloudLayers.packValues writes a Vector4 â€” must always be 4 RGBA slots. */
const EMPTY_A_LAYER = {
  channel: 'a' as const,
  altitude: 0,
  height: 1,
  densityScale: 0,
  shadow: false,
};

export interface VolumetricCloudLighting {
  sunDirection: Vector3;
  sunIntensity: number;
  sunColor: Color;
  daylightFactor: number;
  nightWeight?: number;
}

export interface VolumetricCloudSystem {
  node: CloudsNode;
  compositeOver: (sceneBeauty: TslNode) => TslNode;
  setSceneDepth: (depth: TextureNode | null) => void;
  syncLighting: (lighting: VolumetricCloudLighting) => void;
  resetTemporalHistory: () => void;
  getTuning: () => Readonly<VolumetricCloudTuning>;
  setTuning: (partial: Partial<VolumetricCloudTuning>) => void;
  resetTuning: () => void;
  dispose: () => void;
}

export function isVolumetricCloudsEnabled(): boolean {
  return VISUAL.clouds.volumetric?.enabled === true;
}

function resolveFourLayers() {
  const cfg = VISUAL.clouds.volumetric;
  const configured = (cfg?.layers ?? []).map((layer) => ({ ...layer }));
  const byChannel = new Map<string, (typeof configured)[number]>(
    configured.map((layer) => [layer.channel, layer]),
  );
  return (['r', 'g', 'b', 'a'] as const).map((channel) => {
    const hit = byChannel.get(channel);
    if (hit) return hit;
    if (channel === 'a') return { ...EMPTY_A_LAYER };
    // Fill any missing RGB from defaults so packValues never sees a hole.
    return {
      channel,
      altitude: 50,
      height: 40,
      densityScale: 0,
      shadow: false,
    };
  });
}


export type VolumetricQualityPreset = "low" | "medium" | "high" | "ultra";

export interface VolumetricCloudTuning {
  coverage: number;
  qualityPreset: VolumetricQualityPreset;
  shadowEnabled: boolean;
  resolutionScale: number;
  temporalUpscale: boolean;
  /** When false, resolve never reuses history (kills ghosting; noisier). */
  temporalHistoryEnabled: boolean;
  temporalAlpha: number;
  scatteringCoefficient: number;
  absorptionCoefficient: number;
  powderScale: number;
  powderExponent: number;
  weatherOffsetX: number;
  weatherOffsetY: number;
  weatherVelocityX: number;
  weatherVelocityY: number;
  /** Layer 0 (r) */
  layer0Altitude: number;
  layer0Height: number;
  layer0Density: number;
  layer0Shape: number;
  layer0ShapeDetail: number;
  layer0Shadow: boolean;
  /** Layer 1 (g) */
  layer1Altitude: number;
  layer1Height: number;
  layer1Density: number;
  layer1Shape: number;
  layer1ShapeDetail: number;
  layer1Shadow: boolean;
  /** Layer 2 (b) */
  layer2Altitude: number;
  layer2Height: number;
  layer2Density: number;
  layer2Shape: number;
  layer2ShapeDetail: number;
  layer2Shadow: boolean;
}

function defaultsFromConfig(): VolumetricCloudTuning {
  const cfg = VISUAL.clouds.volumetric!;
  const layers = resolveFourLayers();
  const l0 = layers[0]!;
  const l1 = layers[1]!;
  const l2 = layers[2]!;
  return {
    coverage: cfg.coverage,
    qualityPreset: cfg.qualityPreset,
    shadowEnabled: true,
    resolutionScale: 1,
    // Bayer 1/16 temporal upscale causes screen-door stipple + reflection ghosting;
    // keep off by default until history/reprojection matches WebGL reference quality.
    temporalUpscale: false,
    temporalHistoryEnabled: false,
    temporalAlpha: 0.25,
    scatteringCoefficient: 1,
    absorptionCoefficient: 0,
    powderScale: 1,
    powderExponent: 1,
    weatherOffsetX: 0,
    weatherOffsetY: 0,
    weatherVelocityX: 0.002,
    weatherVelocityY: 0,
    layer0Altitude: l0.altitude,
    layer0Height: l0.height,
    layer0Density: l0.densityScale,
    layer0Shape: 1,
    layer0ShapeDetail: 1,
    layer0Shadow: Boolean(l0.shadow),
    layer1Altitude: l1.altitude,
    layer1Height: l1.height,
    layer1Density: l1.densityScale,
    layer1Shape: 1,
    layer1ShapeDetail: 1,
    layer1Shadow: Boolean(l1.shadow),
    layer2Altitude: l2.altitude,
    layer2Height: l2.height,
    layer2Density: l2.densityScale,
    layer2Shape: 1,
    layer2ShapeDetail: 1,
    layer2Shadow: Boolean(l2.shadow),
  };
}

function applyTuningToNode(node: CloudsNode, tuning: VolumetricCloudTuning): void {
  node.coverage = tuning.coverage;
  node.setQualityPreset(tuning.qualityPreset);
  node.shadowEnabled = tuning.shadowEnabled;
  node.resolutionScale = tuning.resolutionScale;
  node.temporalUpscale = tuning.temporalUpscale;
  node.temporalHistoryEnabled = tuning.temporalHistoryEnabled;
  node.temporalAlpha = tuning.temporalAlpha;
  node.scatteringCoefficient = tuning.scatteringCoefficient;
  node.absorptionCoefficient = tuning.absorptionCoefficient;
  node.powderScale = tuning.powderScale;
  node.powderExponent = tuning.powderExponent;
  node.localWeatherOffset.set(tuning.weatherOffsetX, tuning.weatherOffsetY);
  node.localWeatherVelocity.set(tuning.weatherVelocityX, tuning.weatherVelocityY);
  const layers = node.cloudLayers;
  if (layers[0]) {
    layers[0].altitude = tuning.layer0Altitude;
    layers[0].height = tuning.layer0Height;
    layers[0].densityScale = tuning.layer0Density;
    layers[0].shapeAmount = tuning.layer0Shape;
    layers[0].shapeDetailAmount = tuning.layer0ShapeDetail;
    layers[0].shadow = tuning.layer0Shadow;
  }
  if (layers[1]) {
    layers[1].altitude = tuning.layer1Altitude;
    layers[1].height = tuning.layer1Height;
    layers[1].densityScale = tuning.layer1Density;
    layers[1].shapeAmount = tuning.layer1Shape;
    layers[1].shapeDetailAmount = tuning.layer1ShapeDetail;
    layers[1].shadow = tuning.layer1Shadow;
  }
  if (layers[2]) {
    layers[2].altitude = tuning.layer2Altitude;
    layers[2].height = tuning.layer2Height;
    layers[2].densityScale = tuning.layer2Density;
    layers[2].shapeAmount = tuning.layer2Shape;
    layers[2].shapeDetailAmount = tuning.layer2ShapeDetail;
    layers[2].shadow = tuning.layer2Shadow;
  }
}

export function createVolumetricCloudSystem(
  camera: PerspectiveCamera,
): VolumetricCloudSystem | null {
  const cfg = VISUAL.clouds.volumetric;
  if (!cfg?.enabled) return null;

  const mapSize = cfg.mapSize ?? WORLD.SIZE;
  const node = clouds({
    camera,
    mapSize: new Vector2(mapSize, mapSize),
    mapOrigin: new Vector3(0, 0, 0),
    worldUnitsPerMeter: 1,
    sunDirection: _sunDir.clone(),
    sunIrradiance: new Vector3(8, 7.5, 6.5),
    skyIrradiance: new Vector3(0.35, 0.42, 0.55),
    coverage: cfg.coverage,
    qualityPreset: cfg.qualityPreset,
    cloudLayers: resolveFourLayers(),
  });

  let tuning = defaultsFromConfig();
  applyTuningToNode(node, tuning);

  return {
    node,
    compositeOver: (sceneBeauty) => compositeClouds(sceneBeauty as never, node as never) as TslNode,
    setSceneDepth: (depth) => {
      node.depthNode = depth;
      node.environment.sceneDepth = depth;
    },
    getTuning: () => tuning,
    setTuning: (partial) => {
      const prevQuality = tuning.qualityPreset;
      const prevShadow = tuning.shadowEnabled;
      const prevRes = tuning.resolutionScale;
      const prevTemporal = tuning.temporalUpscale;
      tuning = { ...tuning, ...partial };
      applyTuningToNode(node, tuning);
      if (
        tuning.qualityPreset !== prevQuality ||
        tuning.shadowEnabled !== prevShadow ||
        tuning.resolutionScale !== prevRes ||
        tuning.temporalUpscale !== prevTemporal
      ) {
        node.resetTemporalHistory();
      }
    },
    resetTuning: () => {
      tuning = defaultsFromConfig();
      applyTuningToNode(node, tuning);
      node.resetTemporalHistory();
    },
    syncLighting: (lighting) => {
      const night = lighting.nightWeight ?? 0;
      const day = Math.max(0, lighting.daylightFactor) * (1 - night * 0.92);
      _sunDir.copy(lighting.sunDirection).normalize();
      if (_sunDir.lengthSq() < 1e-6) _sunDir.set(0.2, 0.9, 0.1).normalize();
      node.environment.sunDirection.copy(_sunDir);

      _tmpColor.copy(lighting.sunColor);
      const sunScale = Math.max(0, lighting.sunIntensity) * (0.15 + day * 1.1);
      _sunIrr.set(_tmpColor.r * sunScale, _tmpColor.g * sunScale, _tmpColor.b * sunScale);
      const skyScale = 0.12 + day * 0.55 + night * 0.08;
      _skyIrr.set(0.25 * skyScale, 0.32 * skyScale, 0.48 * skyScale);
      node.environment.sunIrradiance.copy(_sunIrr);
      node.environment.skyIrradiance.copy(_skyIrr);
      node.environment.update();
    },
    resetTemporalHistory: () => {
      node.resetTemporalHistory();
    },
    dispose: () => {
      node.dispose();
    },
  };
}
