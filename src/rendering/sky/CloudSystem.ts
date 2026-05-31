// src/rendering/sky/CloudSystem.ts — orchestrator: layout + sprite layers + dev rebuild hookup
import { Group, Object3D, Vector3, type Texture } from 'three';
import { devSettings, type CloudDevSettings } from '../../core/GameState';
import type { CloudHorizonRingSettings } from '../../world/cloud/cloudHorizonRing';
import {
  DEG2RAD,
  HORIZON_RING_COUNT,
  LAYOUT_SEED,
  buildHorizonRingTier,
  buildLayeredClusters,
  mulberry32,
  type LayerSpawnConfig,
} from '../../world/cloud/cloudLayout';
import {
  createSpriteLayer,
  disposeSpriteLayer,
  writeBillboardMatrices,
  type SpriteLayer,
} from '../../world/cloud/cloudInstancing';
import { USE_HORIZON_CLOUDS } from './skyDefaults';

/** Sparse sky above the player — a handful of distant puffs only. */
const HIGH_LAYER: LayerSpawnConfig = {
  clusters: 6,
  layersPerCluster: 3,
  layerSpread: 10,
  rMin: 150,
  rMax: 600,
  yMin: 140,
  yMax: 220,
  scaleMin: 60,
  scaleMax: 100,
};

export interface CloudSystem {
  group: Object3D;
  update(cameraPos: Vector3, daylight: number): void;
  syncDevSettings(): void;
  dispose(): void;
}

function applyAtmosphereUniforms(layer: SpriteLayer, settings: CloudDevSettings): void {
  layer.uniforms.uNightAlphaMul.value = settings.nightAlphaMul;
  layer.uniforms.uAlphaPower.value = settings.alphaPower;
  layer.uniforms.uColorDayThreshold.value = settings.colorDayThreshold;
  layer.uniforms.uNightTintDarkness.value = settings.nightTintDarkness;
}

function applyRingUniforms(
  layer: SpriteLayer,
  ring: CloudHorizonRingSettings,
  settings: CloudDevSettings,
): void {
  layer.uniforms.uOpacityBoost.value = ring.puffOpacity;
  layer.uniforms.uAlphaMin.value = ring.puffAlphaMin;
  layer.uniforms.uAlphaMax.value = ring.puffAlphaMax;
  applyAtmosphereUniforms(layer, settings);
}

export function createCloudSystem(cloudTexture: Texture): CloudSystem {
  const rand = mulberry32(LAYOUT_SEED);
  const highInstances = buildLayeredClusters(HIGH_LAYER, 1, rand);

  const horizonRoot = new Group();
  const horizonLayers: SpriteLayer[] = [];

  // Horizon billboard rings are gated behind USE_HORIZON_CLOUDS.
  // When the flag is false we skip building (and rebuilding) the rings entirely;
  // SkyMesh shader clouds handle the visible sky alone. Re-enable by flipping
  // the flag in skyDefaults.ts — this rebuild path stays here ready for that.
  const rebuildHorizon = () => {
    if (!USE_HORIZON_CLOUDS) return;
    const settings = devSettings.clouds;
    for (const layer of horizonLayers) {
      horizonRoot.remove(layer.mesh);
      disposeSpriteLayer(layer);
    }
    horizonLayers.length = 0;

    const rotRad = settings.ringRotationDeg * DEG2RAD;
    for (let i = 0; i < HORIZON_RING_COUNT; i++) {
      const ring = settings.rings[i];
      const instances = buildHorizonRingTier(
        ring,
        settings.rotationJitter,
        rotRad,
        mulberry32(((LAYOUT_SEED + i * 997 + Math.round(ring.rCenter)) >>> 0)),
      );
      const layer = createSpriteLayer(cloudTexture, instances, -(HORIZON_RING_COUNT - i));
      applyRingUniforms(layer, ring, settings);
      horizonLayers.push(layer);
      horizonRoot.add(layer.mesh);
    }
  };

  rebuildHorizon();
  devSettings.clouds.dirty = false;

  const highLayer = createSpriteLayer(cloudTexture, highInstances, 0);
  highLayer.uniforms.uOpacityBoost.value = 1;
  highLayer.uniforms.uAlphaMin.value = 0.55;
  highLayer.uniforms.uAlphaMax.value = 1;
  applyAtmosphereUniforms(highLayer, devSettings.clouds);

  const group = new Group();
  if (USE_HORIZON_CLOUDS) {
    group.add(highLayer.mesh, horizonRoot);
  } else {
    group.add(highLayer.mesh);
  }

  const applyLiveDev = (settings: CloudDevSettings) => {
    applyAtmosphereUniforms(highLayer, settings);
    for (let i = 0; i < horizonLayers.length; i++) {
      applyRingUniforms(horizonLayers[i], settings.rings[i], settings);
    }
  };

  return {
    group,
    update(cameraPos, daylight) {
      // Skip per-instance billboard rewrites + lookAt + computeBoundingSphere
      // when the entire cloud group is hidden (e.g. USE_HORIZON_CLOUDS=false).
      // syncDevSettings() still runs ahead of this from SkySystem so dev edits
      // continue to be reflected if the group is re-shown.
      if (!group.visible) return;
      highLayer.uniforms.uDaylight.value = daylight;
      writeBillboardMatrices(highLayer.mesh, highLayer.instances, cameraPos);
      for (const layer of horizonLayers) {
        layer.uniforms.uDaylight.value = daylight;
        writeBillboardMatrices(layer.mesh, layer.instances, cameraPos);
      }
    },
    syncDevSettings() {
      const settings = devSettings.clouds;
      // Horizon rebuilds are no-ops while USE_HORIZON_CLOUDS = false, so just
      // clear the dirty flags and apply live uniforms to the high layer.
      if (settings.dirty) {
        rebuildHorizon();
        settings.dirty = false;
        settings.liveDirty = false;
        applyLiveDev(settings);
      } else if (settings.liveDirty) {
        settings.liveDirty = false;
        applyLiveDev(settings);
      }
    },
    dispose() {
      disposeSpriteLayer(highLayer);
      for (const layer of horizonLayers) {
        disposeSpriteLayer(layer);
      }
    },
  };
}
