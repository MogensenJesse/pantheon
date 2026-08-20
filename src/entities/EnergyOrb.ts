// src/entities/EnergyOrb.ts

import alea from 'alea';
import { Mesh, type Scene, SphereGeometry, Vector3 } from 'three';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { bus } from '../core/EventBus';
import { addEnergy } from '../core/energy';
import { state } from '../core/GameState';
import { GLOW_MESH_RENDER_ORDER } from '../rendering/glowMaterial';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { createEnergyOrbParticles } from './energyOrbParticles';
import { orbCenterY } from './orbFloat';
import { sampleOrbTerrainFooting } from './orbTerrainFooting';
import { getLiveOrganicOrbSettings } from './organicOrb/organicOrbDevState';
import { createOrganicOrbMaterial } from './organicOrb/organicOrbMaterial';

const { ABSORB_RADIUS_SQ, ENERGY_RADIUS: ORB_RADIUS, RNG_SEED } = PHASE0.ORB;

export interface EnergyOrb {
  mesh: Mesh;
  worldPos: Vector3;
  bobPhase: number;
  energyValue: number;
  absorbed: boolean;
  updateFloat: (terrainY: number, elapsed: number, surfaceNormalY?: number) => void;
  updatePulse: (scale: number) => void;
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
  material: MeshBasicNodeMaterial,
  geometry: SphereGeometry,
  onAbsorb: (origin: Vector3, playerPos: Vector3) => void,
  surfaceNormalY = 1,
): EnergyOrb {
  const worldPos = new Vector3(x, orbCenterY(terrainY, ORB_RADIUS, 0, bobPhase, surfaceNormalY), z);
  let absorbed = false;

  const mesh = new Mesh(geometry, material);
  mesh.position.copy(worldPos);
  mesh.renderOrder = GLOW_MESH_RENDER_ORDER;
  scene.add(mesh);

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
    checkAbsorption(playerPos: Vector3) {
      if (absorbed) return;
      const dx = playerPos.x - worldPos.x;
      const dz = playerPos.z - worldPos.z;
      const dy = playerPos.y - worldPos.y;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < ABSORB_RADIUS_SQ) {
        absorbed = true;
        mesh.visible = false;
        onAbsorb(worldPos, playerPos);
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
  const rng = alea(`${RNG_SEED}-orbs`);
  const organic = createOrganicOrbMaterial();
  organic.setMorphOriginMul(0.18);
  organic.sync({ ...getLiveOrganicOrbSettings(), ...VISUAL.energyOrb.look });
  const orbGeometry = new SphereGeometry(ORB_RADIUS, 48, 48);

  const slotPlacements = options.placements;
  if (slotPlacements.length === 0) {
    throw new Error('initOrbSystem requires at least one orb placement from the map.');
  }

  const sparkles = createEnergyOrbParticles(scene, slotPlacements.length);

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
        organic.material,
        orbGeometry,
        sparkles.burst,
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

    organic.sync({ ...getLiveOrganicOrbSettings(), ...VISUAL.energyOrb.look });
    sparkles.update(elapsed, playerPos);
    for (const orb of orbs) {
      if (orb.absorbed) continue;
      const footing = sampleOrbTerrainFooting(terrain, orb.worldPos.x, orb.worldPos.z, ORB_RADIUS);
      orb.updateFloat(footing.surfaceY, elapsed, footing.normalY);
      orb.updatePulse(pulseScale);
      orb.checkAbsorption(playerPos);
    }
    sparkles.syncIdle(orbs);
  };

  const dispose = () => {
    sparkles.dispose();
    for (const orb of orbs) {
      orb.dispose();
    }
    orbGeometry.dispose();
    organic.dispose();
  };

  return { orbs, update, dispose };
}
