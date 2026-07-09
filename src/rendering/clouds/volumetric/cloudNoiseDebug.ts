// src/rendering/clouds/volumetric/cloudNoiseDebug.ts — DEV sphere preview for cloudNoiseTsl FBM
import { Mesh, type PerspectiveCamera, type Scene, SphereGeometry, Vector3 } from 'three';
import { mix, positionWorld, pow, smoothstep, uniform, vec3 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { devSettings } from '../../../core/GameState';
import {
  cloudFbm3D,
  cloudNoiseSamplePosition,
  DEFAULT_CLOUD_FBM,
} from './cloudNoiseTsl';

const _forward = new Vector3();
const _right = new Vector3();
const _offset = new Vector3();

/** Preview sphere — small + far enough to read FBM blobs, not fill the frame. */
const DEBUG_SPHERE_RADIUS = 20;
const DEBUG_SPHERE_DISTANCE = 155;
const DEBUG_SPHERE_RIGHT_OFFSET = 45;
const DEBUG_SPHERE_LIFT = 28;

export interface CloudNoiseDebugContext {
  mesh: Mesh;
  update: (camera: PerspectiveCamera, elapsed: number) => void;
  dispose: () => void;
}

/** Grayscale → pale-blue heat map for FBM density on a unit sphere. */
function createCloudNoiseDebugMaterial(): MeshBasicNodeMaterial {
  const uTime = uniform(0);
  const uScale = uniform(0.0075);

  const samplePos = cloudNoiseSamplePosition(positionWorld, uScale, uTime);
  const density = cloudFbm3D(samplePos, DEFAULT_CLOUD_FBM);
  const shaped = smoothstep(0.22, 0.78, pow(density, 0.85));
  const low = vec3(0.04, 0.06, 0.14);
  const high = vec3(0.92, 0.95, 1.0);
  const color = mix(low, high, shaped);

  const material = new MeshBasicNodeMaterial();
  material.fog = false;
  material.colorNode = color;

  material.userData.cloudNoiseDebug = { uTime, uScale };
  return material;
}

/**
 * Floating debug sphere — enable via Render debug → "Cloud noise preview".
 * Validates TSL hash + FBM before raymarch integration (Phase 2.2).
 */
export function initCloudNoiseDebug(scene: Scene): CloudNoiseDebugContext {
  const material = createCloudNoiseDebugMaterial();
  const uniforms = material.userData.cloudNoiseDebug as {
    uTime: { value: number };
    uScale: { value: number };
  };

  const geometry = new SphereGeometry(DEBUG_SPHERE_RADIUS, 40, 28);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'cloudNoiseDebug';
  mesh.frustumCulled = false;
  mesh.renderOrder = 900;
  mesh.visible = false;
  scene.add(mesh);

  return {
    mesh,
    update: (camera, elapsed) => {
      const show =
        devSettings.renderDebug.showCloudNoiseDebug &&
        !devSettings.renderDebug.showVolumetricCloudRaymarch;
      mesh.visible = show;
      if (!show) return;

      camera.getWorldDirection(_forward);
      _right.setFromMatrixColumn(camera.matrixWorld, 0);
      _offset.copy(_forward).multiplyScalar(DEBUG_SPHERE_DISTANCE);
      _offset.addScaledVector(_right, DEBUG_SPHERE_RIGHT_OFFSET);
      _offset.y += DEBUG_SPHERE_LIFT;
      mesh.position.copy(camera.position).add(_offset);

      uniforms.uTime.value = elapsed;
    },
    dispose: () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
