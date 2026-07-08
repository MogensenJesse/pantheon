// src/entities/EnergyOrb.ts

import alea from 'alea';
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Points,
  PointsMaterial,
  type Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { PHASE0 } from '../config/phase0';
import { bus } from '../core/EventBus';
import { addEnergy } from '../core/energy';
import { state } from '../core/GameState';
import { createGlowNodeMaterial, GLOW_MESH_RENDER_ORDER } from '../rendering/glowMaterial';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { WORLD } from '../world/WorldConfig';
import { orbCenterY } from './orbFloat';
import { sampleOrbTerrainFooting } from './orbTerrainFooting';

const { ABSORB_RADIUS_SQ, BURST_DURATION, ENERGY_RADIUS: ORB_RADIUS } = PHASE0.ORB;

function createOrbGlowMaterial() {
  return createGlowNodeMaterial({
    colorHex: 0xffc840,
    emissiveHex: 0xffcc44,
    emissiveIntensity: 1.35,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
}

export interface EnergyOrb {
  mesh: Mesh;
  worldPos: Vector3;
  bobPhase: number;
  energyValue: number;
  absorbed: boolean;
  updateFloat: (terrainY: number, elapsed: number, surfaceNormalY?: number) => void;
  updatePulse: (scale: number) => void;
  updateBurst: (dt: number) => void;
  checkAbsorption: (playerPos: Vector3) => void;
  dispose: () => void;
}

function createEnergyOrb(
  scene: Scene,
  x: number,
  z: number,
  terrainY: number,
  bobPhase: number,
  energyValue: number,
  material: ReturnType<typeof createOrbGlowMaterial>,
  geometry: SphereGeometry,
  surfaceNormalY = 1,
): EnergyOrb {
  const worldPos = new Vector3(x, orbCenterY(terrainY, ORB_RADIUS, 0, bobPhase, surfaceNormalY), z);
  let absorbed = false;
  let burstMesh: Points | null = null;
  let burstAge = 0;

  const mesh = new Mesh(geometry, material);
  mesh.position.copy(worldPos);
  mesh.renderOrder = GLOW_MESH_RENDER_ORDER;
  scene.add(mesh);

  const spawnBurst = () => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute([worldPos.x, worldPos.y, worldPos.z], 3),
    );
    const mat = new PointsMaterial({
      color: 0xffc840,
      size: 1.2,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    burstMesh = new Points(geo, mat);
    burstMesh.renderOrder = GLOW_MESH_RENDER_ORDER;
    burstAge = 0;
    scene.add(burstMesh);
  };

  const disposeBurst = () => {
    if (!burstMesh) return;
    scene.remove(burstMesh);
    burstMesh.geometry.dispose();
    (burstMesh.material as PointsMaterial).dispose();
    burstMesh = null;
  };

  return {
    mesh,
    worldPos,
    bobPhase,
    energyValue,
    get absorbed() {
      return absorbed;
    },
    updateFloat(terrainY: number, elapsed: number, surfaceNormalY = 1) {
      if (absorbed) return;
      const y = orbCenterY(terrainY, ORB_RADIUS, elapsed, bobPhase, surfaceNormalY);
      worldPos.y = y;
      mesh.position.y = y;
    },
    updatePulse(scale: number) {
      if (absorbed) return;
      mesh.scale.setScalar(scale);
    },
    updateBurst(dt: number) {
      if (!burstMesh) return;
      burstAge += dt;
      const t = Math.min(1, burstAge / BURST_DURATION);
      const mat = burstMesh.material as PointsMaterial;
      mat.size = 1.2 + t * 5.0;
      mat.opacity = 1 - t;
      if (t >= 1) {
        disposeBurst();
      }
    },
    checkAbsorption(playerPos: Vector3) {
      if (absorbed) return;
      const dx = playerPos.x - worldPos.x;
      const dz = playerPos.z - worldPos.z;
      const dy = playerPos.y - worldPos.y;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < ABSORB_RADIUS_SQ) {
        absorbed = true;
        mesh.visible = false;
        spawnBurst();
        state.orbsAbsorbed += 1;
        addEnergy(energyValue);
        bus.emit('orb:absorbed', {
          energy: energyValue,
          x: worldPos.x,
          y: worldPos.y,
          z: worldPos.z,
        });
      }
    },
    dispose() {
      disposeBurst();
      scene.remove(mesh);
    },
  };
}

export interface OrbPlacement {
  x: number;
  z: number;
  energy?: number;
}

export interface InitOrbSystemOptions {
  placements: OrbPlacement[];
}

export interface OrbSystemContext {
  orbs: EnergyOrb[];
  update: (playerPos: Vector3, dt: number) => void;
  dispose: () => void;
}

export function countVisibleOrbs(orbs: EnergyOrb[]): number {
  let n = 0;
  for (const o of orbs) {
    if (o.mesh.visible) n++;
  }
  return n;
}

export function initOrbSystem(
  scene: Scene,
  terrain: MapTerrainContext,
  options: InitOrbSystemOptions,
): OrbSystemContext {
  const rng = alea(`${WORLD.SEED}-orbs`);
  const orbMaterial = createOrbGlowMaterial();
  const orbGeometry = new SphereGeometry(ORB_RADIUS, 24, 24);

  const slotPlacements = options.placements;
  if (slotPlacements.length === 0) {
    throw new Error('initOrbSystem requires at least one orb placement from the map.');
  }

  const orbs: EnergyOrb[] = [];
  for (let i = 0; i < slotPlacements.length; i++) {
    const slot = slotPlacements[i];
    const x = slot.x;
    const z = slot.z;
    const footing = sampleOrbTerrainFooting(terrain, x, z, ORB_RADIUS);
    const bobPhase = rng() * Math.PI * 2;
    const authoredEnergy =
      'energy' in slot && typeof slot.energy === 'number' ? slot.energy : undefined;
    const energyValue =
      authoredEnergy ??
      PHASE0.ORB.ENERGY_MIN + Math.floor(rng() * (PHASE0.ORB.ENERGY_MAX - PHASE0.ORB.ENERGY_MIN));
    orbs.push(
      createEnergyOrb(
        scene,
        x,
        z,
        footing.surfaceY,
        bobPhase,
        energyValue,
        orbMaterial,
        orbGeometry,
        footing.normalY,
      ),
    );
  }

  let elapsed = 0;

  const update = (playerPos: Vector3, dt: number) => {
    elapsed += dt;
    const pulseScale =
      PHASE0.ORB.PULSE_BASE +
      PHASE0.ORB.PULSE_AMPLITUDE * Math.sin(elapsed * PHASE0.ORB.PULSE_SPEED);

    for (const orb of orbs) {
      if (orb.absorbed) {
        orb.updateBurst(dt);
        continue;
      }
      const footing = sampleOrbTerrainFooting(terrain, orb.worldPos.x, orb.worldPos.z, ORB_RADIUS);
      orb.updateFloat(footing.surfaceY, elapsed, footing.normalY);
      orb.updatePulse(pulseScale);
      orb.checkAbsorption(playerPos);
    }
  };

  const dispose = () => {
    for (const orb of orbs) {
      orb.dispose();
    }
    orbGeometry.dispose();
    orbMaterial.dispose();
  };

  return { orbs, update, dispose };
}
