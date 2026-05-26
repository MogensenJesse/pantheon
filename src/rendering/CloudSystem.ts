// src/rendering/CloudSystem.ts — mrdoob-style billboard cloud sprites (InstancedMesh)
import { devSettings, type CloudDevSettings } from '../core/GameState';
import type { CloudHorizonRingSettings } from '../world/cloud/cloudHorizonRing';
import {
  DoubleSide,
  Group,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  Vector3,
  type Texture,
} from 'three';
import { float, max, mix, pow, smoothstep, texture, uniform, uv, vec3 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

/** Sparse sky above the player — a handful of distant puffs only. */
const HIGH_LAYER = {
  clusters: 6,
  layersPerCluster: 3,
  layerSpread: 10,
  rMin: 150,
  rMax: 600,
  yMin: 140,
  yMax: 220,
  scaleMin: 60,
  scaleMax: 100,
} as const;

const HORIZON_Y = { min: 1.6, max: 26 } as const;
const HORIZON_SCALE = { min: 70, max: 105 } as const;
const LAYER_SPREAD = 12;

const LAYOUT_SEED = 0x636c6f75; // 'clou'
const DEG2RAD = Math.PI / 180;
const HORIZON_RING_COUNT = 3;

interface CloudInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  zRot: number;
}

interface LayerSpawnConfig {
  clusters: number;
  layersPerCluster: number;
  layerSpread: number;
  rMin: number;
  rMax: number;
  yMin: number;
  yMax: number;
  scaleMin: number;
  scaleMax: number;
}

const NIGHT_ALPHA_FLOOR = 0.15;

type CloudMaterialUniforms = {
  uDaylight: ReturnType<typeof uniform>;
  uOpacityBoost: ReturnType<typeof uniform>;
  uAlphaMin: ReturnType<typeof uniform>;
  uAlphaMax: ReturnType<typeof uniform>;
  uNightAlphaMul: ReturnType<typeof uniform>;
  uAlphaPower: ReturnType<typeof uniform>;
  uColorDayThreshold: ReturnType<typeof uniform>;
  uNightTintDarkness: ReturnType<typeof uniform>;
};

export interface CloudSystem {
  group: Object3D;
  update(cameraPos: Vector3, daylight: number): void;
  syncDevSettings(): void;
  dispose(): void;
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), s | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushClusterLayers(
  out: CloudInstance[],
  x: number,
  y: number,
  z: number,
  baseScale: number,
  baseZRot: number,
  layersPerCluster: number,
  spread: number,
  rotationJitter: number,
  rand: () => number,
): void {
  const dist = Math.hypot(x, z) || 1;
  const nx = x / dist;
  const nz = z / dist;
  const rotSpread = 0.4 * rotationJitter;

  for (let l = 0; l < layersPerCluster; l++) {
    const layerT = l - (layersPerCluster - 1) * 0.5;
    out.push({
      x: x + nx * layerT * spread * 0.35 + (rand() - 0.5) * spread * 0.4,
      y: y + layerT * spread * 0.2 + (rand() - 0.5) * spread * 0.25,
      z: z + nz * layerT * spread * 0.35 + (rand() - 0.5) * spread * 0.4,
      scale: baseScale * (0.88 + rand() * 0.18),
      zRot: baseZRot + (rand() - 0.5) * rotSpread,
    });
  }
}

function buildLayeredClusters(cfg: LayerSpawnConfig, rotationJitter: number, rand: () => number): CloudInstance[] {
  const out: CloudInstance[] = [];

  for (let c = 0; c < cfg.clusters; c++) {
    const angle = rand() * Math.PI * 2;
    const r = Math.sqrt(rand() * (cfg.rMax * cfg.rMax - cfg.rMin * cfg.rMin) + cfg.rMin * cfg.rMin);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = cfg.yMin + rand() * (cfg.yMax - cfg.yMin);
    const baseScale = cfg.scaleMin + rand() * (cfg.scaleMax - cfg.scaleMin);
    pushClusterLayers(
      out,
      x,
      y,
      z,
      baseScale,
      rand() * Math.PI * 2,
      cfg.layersPerCluster,
      cfg.layerSpread,
      rotationJitter,
      rand,
    );
  }
  return out;
}

/** Build one horizon tier (evenly spaced + optional staggered half-ring). */
function buildHorizonRingTier(
  ring: CloudHorizonRingSettings,
  rotationJitter: number,
  ringRotationRad: number,
  rand: () => number,
): CloudInstance[] {
  const out: CloudInstance[] = [];
  const layers = Math.max(1, Math.round(ring.layersPerCluster));
  const primary = Math.max(4, Math.round(ring.clusters));
  const staggered = Math.max(0, Math.round(ring.staggeredClusters));

  const placeRing = (count: number, angleOffset: number, rBias: number) => {
    if (count <= 0) return;
    for (let c = 0; c < count; c++) {
      const angle = (c / count) * Math.PI * 2 + angleOffset + ringRotationRad + (rand() - 0.5) * 0.08;
      const r = ring.rCenter + (rand() - 0.5) * ring.rSpread * rBias;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = HORIZON_Y.min + rand() * (HORIZON_Y.max - HORIZON_Y.min);
      const baseScale = HORIZON_SCALE.min + rand() * (HORIZON_SCALE.max - HORIZON_SCALE.min);
      pushClusterLayers(
        out,
        x,
        y,
        z,
        baseScale,
        rand() * Math.PI * 2,
        layers,
        LAYER_SPREAD,
        rotationJitter,
        rand,
      );
    }
  };

  placeRing(primary, 0, 1);
  if (staggered > 0) {
    placeRing(staggered, Math.PI / staggered, 0.85);
  }

  return out;
}

function createCloudSpriteMaterial(cloudTexture: Texture): {
  mat: MeshBasicNodeMaterial;
  uniforms: CloudMaterialUniforms;
} {
  const uDaylight = uniform(0.12);
  const uOpacityBoost = uniform(0.62);
  const uAlphaMin = uniform(0.38);
  const uAlphaMax = uniform(0.72);
  const uNightAlphaMul = uniform(0.2);
  const uAlphaPower = uniform(2.2);
  const uColorDayThreshold = uniform(0.35);
  const uNightTintDarkness = uniform(0.85);

  const texNode = texture(cloudTexture, uv());
  const dayTint = vec3(1.0, 0.97, 0.92);
  const skyNightTint = vec3(0.04, 0.05, 0.08);
  const twilightTint = vec3(0.12, 0.1, 0.14);
  const nightTint = mix(twilightTint, skyNightTint, uNightTintDarkness);

  const colorMix = smoothstep(float(0), uColorDayThreshold, uDaylight);
  const tint = mix(nightTint, dayTint, colorMix);

  const lum = texNode.r.mul(0.299).add(texNode.g.mul(0.587)).add(texNode.b.mul(0.114));
  const desatAmt = float(1).sub(colorMix).mul(0.65);
  const desatRgb = mix(texNode.rgb, vec3(lum, lum, lum), desatAmt);
  const colored = desatRgb.mul(tint);

  const alphaMix = pow(max(uDaylight, float(0)), uAlphaPower).mul(uNightAlphaMul);
  const daylightAlpha = mix(
    uAlphaMin.mul(float(NIGHT_ALPHA_FLOOR)),
    uAlphaMax,
    alphaMix,
  );

  const mat = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
  });
  mat.colorNode = colored;
  mat.opacityNode = texNode.a.mul(daylightAlpha).mul(uOpacityBoost);

  return {
    mat,
    uniforms: {
      uDaylight,
      uOpacityBoost,
      uAlphaMin,
      uAlphaMax,
      uNightAlphaMul,
      uAlphaPower,
      uColorDayThreshold,
      uNightTintDarkness,
    },
  };
}

const _dummy = new Object3D();

function writeBillboardMatrices(
  mesh: InstancedMesh,
  instances: CloudInstance[],
  cameraPos: Vector3,
): void {
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    _dummy.position.set(inst.x, inst.y, inst.z);
    _dummy.scale.setScalar(inst.scale);
    _dummy.lookAt(cameraPos);
    _dummy.rotateZ(inst.zRot);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

type SpriteLayer = {
  mesh: InstancedMesh;
  material: MeshBasicNodeMaterial;
  uniforms: CloudMaterialUniforms;
  geometry: PlaneGeometry;
  instances: CloudInstance[];
};

function createSpriteLayer(
  cloudTexture: Texture,
  instances: CloudInstance[],
  renderOrder: number,
): SpriteLayer {
  const { mat, uniforms } = createCloudSpriteMaterial(cloudTexture);
  const geometry = new PlaneGeometry(1, 1);
  const mesh = new InstancedMesh(geometry, mat, instances.length);
  mesh.frustumCulled = true;
  mesh.renderOrder = renderOrder;
  return { mesh, material: mat, uniforms, geometry, instances };
}

function disposeSpriteLayer(layer: SpriteLayer): void {
  layer.mesh.dispose();
  layer.geometry.dispose();
  layer.material.dispose();
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

  const rebuildHorizon = () => {
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
  group.add(highLayer.mesh, horizonRoot);

  const applyLiveDev = (settings: CloudDevSettings) => {
    applyAtmosphereUniforms(highLayer, settings);
    for (let i = 0; i < horizonLayers.length; i++) {
      applyRingUniforms(horizonLayers[i], settings.rings[i], settings);
    }
  };

  return {
    group,
    update(cameraPos, daylight) {
      highLayer.uniforms.uDaylight.value = daylight;
      for (const layer of horizonLayers) {
        layer.uniforms.uDaylight.value = daylight;
      }
      writeBillboardMatrices(highLayer.mesh, highLayer.instances, cameraPos);
      for (const layer of horizonLayers) {
        writeBillboardMatrices(layer.mesh, layer.instances, cameraPos);
      }
    },
    syncDevSettings() {
      const settings = devSettings.clouds;
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
