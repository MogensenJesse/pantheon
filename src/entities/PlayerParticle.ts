// src/entities/PlayerParticle.ts
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { devSettings } from '../core/GameState';
import { getMovementDirection } from '../core/InputManager';
import { WORLD } from '../world/WorldConfig';
import type { TerrainContext } from '../world/TerrainGenerator';
import type { MovementAxes } from '../rendering/CameraRig';
import { enableBloomLayer } from '../rendering/bloomLayer';

const BASE_SPEED = 6;

function terrainSpeedMultiplier(h: number): number {
  if (h >= 1.9) return 0.5;
  if (h >= 0.42 && h < 1.1) return 0.65;
  return 1;
}

function createOrbitGlowTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(220, 200, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(160, 120, 220, 0.6)');
  gradient.addColorStop(1, 'rgba(80, 40, 120, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

const ORBIT_COUNT = 5;

function createOrbitParticles(scene: Scene): Points {
  const positions = new Float32Array(ORBIT_COUNT * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  const material = new PointsMaterial({
    map: createOrbitGlowTexture(),
    size: 0.3,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    color: 0x9080e8,
    blending: AdditiveBlending,
    opacity: 0.55,
    alphaTest: 0.01,
  });

  const mesh = new Points(geometry, material);
  scene.add(mesh);
  return mesh;
}

export interface PlayerParticleContext {
  mesh: Object3D;
  position: Vector3;
  update: (dt: number, viewAxes: MovementAxes) => void;
  setIlluminationRadius: (ratio: number) => void;
}

export function initPlayerParticle(
  scene: Scene,
  terrain: TerrainContext,
  startX: number,
  startZ: number,
): PlayerParticleContext {
  // Sphere-based god-particle group — matches reference design
  const group = new Group();
  group.position.set(startX, terrain.getWorldY(startX, startZ) + 0.1, startZ);

  const core = new Mesh(
    new SphereGeometry(0.18, 16, 16),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  group.add(core);

  const innerGlowMat = new MeshBasicMaterial({
    color: 0xd8a8ff,
    transparent: true,
    opacity: 0.6,
    side: BackSide,
  });
  const innerGlow = new Mesh(new SphereGeometry(0.36, 16, 16), innerGlowMat);
  group.add(innerGlow);

  const outerGlowMat = new MeshBasicMaterial({
    color: 0x8840d0,
    transparent: true,
    opacity: 0.16,
    side: BackSide,
  });
  const outerGlow = new Mesh(new SphereGeometry(0.75, 16, 16), outerGlowMat);
  group.add(outerGlow);

  const playerLight = new PointLight(0xd4c0ff, 5, 8);
  playerLight.decay = 1; // linear falloff — more visible illumination sphere
  group.add(playerLight);

  scene.add(group);
  enableBloomLayer(group);

  const position = group.position;
  const orbitMesh = createOrbitParticles(scene);
  enableBloomLayer(orbitMesh);

  let elapsed = 0;

  const update = (dt: number, viewAxes: MovementAxes) => {
    elapsed += dt;

    let worldY = terrain.getWorldY(position.x, position.z);
    const dir = getMovementDirection();
    if (dir.lengthSq() > 0) {
      const h = worldY / WORLD.HEIGHT_SCALE;
      const speed = BASE_SPEED * terrainSpeedMultiplier(h) * devSettings.movementSpeedMultiplier;
      // W / ArrowUp: move along camera view (away from camera). A/D strafe on XZ.
      const forward = -dir.y;
      const strafe = dir.x;
      position.x +=
        (viewAxes.forwardX * forward + viewAxes.rightX * strafe) * speed * dt;
      position.z +=
        (viewAxes.forwardZ * forward + viewAxes.rightZ * strafe) * speed * dt;

      const half = WORLD.SIZE * 0.48;
      position.x = Math.max(-half, Math.min(half, position.x));
      position.z = Math.max(-half, Math.min(half, position.z));
      worldY = terrain.getWorldY(position.x, position.z);
    }

    position.y = worldY + 0.1;

    // Pulse inner/outer glow each frame
    const pulse = Math.sin(elapsed * 2.0);
    innerGlow.scale.setScalar(1 + 0.08 * pulse);
    outerGlow.scale.setScalar(1 + 0.12 * pulse);

    const orbitPos = orbitMesh.geometry.attributes.position as Float32BufferAttribute;
    for (let i = 0; i < ORBIT_COUNT; i++) {
      const angle = (i / ORBIT_COUNT) * Math.PI * 2 + elapsed * 0.85 + i * 1.1;
      const r = 0.42 + 0.08 * Math.sin(elapsed * 1.6 + i * 2.3);
      orbitPos.setXYZ(
        i,
        position.x + Math.cos(angle) * r,
        position.y,
        position.z + Math.sin(angle) * r,
      );
    }
    orbitPos.needsUpdate = true;
  };

  const setIlluminationRadius = (ratio: number): void => {
    // At 0 orbs: tight circle (distance 8). At 26 orbs (100%): illuminate ~60% of map.
    // Linear decay keeps the falloff visible at larger radii.
    playerLight.distance = 8 + ratio * 110;
    playerLight.intensity = 5 + ratio * 15;
  };

  return { mesh: group, position, update, setIlluminationRadius };
}
