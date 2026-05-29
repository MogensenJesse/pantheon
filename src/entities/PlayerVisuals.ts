// src/entities/PlayerVisuals.ts — single pulsing player orb + orbit particles
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { createGlowNodeMaterial, GLOW_MESH_RENDER_ORDER } from '../rendering/glowMaterial';
import { PHASE0 } from '../config/phase0';

const ORBIT_COUNT = 5;
const ORB_RADIUS = PHASE0.ORB.PLAYER_RADIUS;

function createOrbitGlowTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.4, 'rgba(220, 220, 255, 0.55)');
  gradient.addColorStop(1, 'rgba(180, 180, 200, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

export interface PlayerVisualsContext {
  group: Group;
  orb: Mesh;
  playerLight: PointLight;
  orbitMesh: Points;
  updatePulse: (elapsed: number) => void;
  updateOrbit: (position: Vector3, elapsed: number) => void;
  dispose: () => void;
}

export function createPlayerVisuals(scene: Scene): PlayerVisualsContext {
  const group = new Group();

  const orb = new Mesh(
    new SphereGeometry(ORB_RADIUS, 24, 24),
    createGlowNodeMaterial({
      colorHex: 0xffffff,
      emissiveHex: 0xffffff,
      emissiveIntensity: PHASE0.BLOOM.PLAYER_EMISSIVE,
    }),
  );
  orb.renderOrder = GLOW_MESH_RENDER_ORDER;
  group.add(orb);

  const playerLight = new PointLight(
    0xffffff,
    PHASE0.PLAYER.LIGHT_INTENSITY_MIN,
    PHASE0.PLAYER.LIGHT_DISTANCE_MIN,
  );
  playerLight.decay = 1;
  group.add(playerLight);

  scene.add(group);

  const orbitPositions = new Float32Array(ORBIT_COUNT * 3);
  const orbitGeometry = new BufferGeometry();
  orbitGeometry.setAttribute('position', new Float32BufferAttribute(orbitPositions, 3));
  const orbitTexture = createOrbitGlowTexture();
  const orbitMaterial = new PointsMaterial({
    map: orbitTexture,
    size: 0.3,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    color: 0xe8e8f8,
    blending: AdditiveBlending,
    opacity: 0.55,
    alphaTest: 0.01,
  });
  const orbitMesh = new Points(orbitGeometry, orbitMaterial);
  orbitMesh.renderOrder = GLOW_MESH_RENDER_ORDER;
  scene.add(orbitMesh);

  const orbitPosAttr = orbitGeometry.attributes.position as Float32BufferAttribute;
  const _lastOrbitPos = new Vector3();
  let orbitDirty = true;
  const updatePulse = (elapsed: number) => {
    const pulse = Math.sin(elapsed * PHASE0.PLAYER.PULSE_SPEED);
    orb.scale.setScalar(1 + 0.1 * pulse);
  };

  const updateOrbit = (position: Vector3, elapsed: number) => {
    if (_lastOrbitPos.distanceToSquared(position) < 1e-6 && !orbitDirty) return;
    _lastOrbitPos.copy(position);
    orbitDirty = false;

    for (let i = 0; i < ORBIT_COUNT; i++) {
      const angle = (i / ORBIT_COUNT) * Math.PI * 2 + elapsed * 0.85 + i * 1.1;
      const r = 0.42 + 0.08 * Math.sin(elapsed * 1.6 + i * 2.3);
      orbitPosAttr.setXYZ(
        i,
        position.x + Math.cos(angle) * r,
        position.y,
        position.z + Math.sin(angle) * r,
      );
    }
    orbitPosAttr.needsUpdate = true;
  };

  const dispose = () => {
    scene.remove(group);
    scene.remove(orbitMesh);
    orb.geometry.dispose();
    (orb.material as { dispose?: () => void }).dispose?.();
    orbitGeometry.dispose();
    orbitTexture.dispose();
    orbitMaterial.dispose();
  };

  return {
    group,
    orb,
    playerLight,
    orbitMesh,
    updatePulse,
    updateOrbit,
    dispose,
  };
}
