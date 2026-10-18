// src/entities/energyOrb/energyOrb.ts — residue orb instance (gameplay + mesh)

import { Mesh, type Scene, type SphereGeometry, Vector3 } from 'three';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { PHASE0 } from '../../config/phase0';
import { bus } from '../../core/EventBus';
import { addEnergy } from '../../core/energy';
import { state } from '../../core/state/gameState';
import { GLOW_MESH_RENDER_ORDER } from '../../rendering/glowMaterial';
import { enableWaterReflectionLayer } from '../../rendering/layers/waterReflectionLayers';
import { modifiers } from '../../skills/modifiers';
import { orbCenterY } from '../orbFloat';

const { ABSORB_RADIUS_SQ, ENERGY_RADIUS: ORB_RADIUS } = PHASE0.ORB;

export interface EnergyOrb {
  mesh: Mesh;
  worldPos: Vector3;
  energyValue: number;
  absorbed: boolean;
  /** Brought back by the respawn rule: it no longer sits at its map place, and picking it up does not
   * lift the world's night lightness (that follows the authored orbs only). */
  respawned: boolean;
  updateFloat: (terrainY: number, elapsed: number, surfaceNormalY?: number) => void;
  updatePulse: (scale: number) => void;
  checkAbsorption: (playerPos: Vector3) => void;
  /** Mark it picked up without the effects (energy, burst, event): a save says it already was. */
  markAbsorbed: () => void;
  /** Live again at a new place with a new energy value (the respawn rule, or a save restoring one). */
  respawn: (x: number, z: number, surfaceY: number, surfaceNormalY: number, energy: number) => void;
  dispose: () => void;
}

export interface OrbPlacement {
  x: number;
  z: number;
  energy?: number;
}

export function createEnergyOrb(
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
  enableWaterReflectionLayer(mesh);
  scene.add(mesh);

  let respawned = false;
  let bob = bobPhase;

  const orb: EnergyOrb = {
    mesh,
    worldPos,
    energyValue,
    get absorbed() {
      return absorbed;
    },
    get respawned() {
      return respawned;
    },
    updateFloat(terrainY: number, elapsed: number, surfaceNormalY = 1) {
      if (absorbed) return;
      const y = orbCenterY(terrainY, ORB_RADIUS, elapsed, bob, surfaceNormalY);
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
      if (distSq < ABSORB_RADIUS_SQ * modifiers.absorbRadiusMul ** 2) {
        absorbed = true;
        mesh.visible = false;
        onAbsorb(worldPos, playerPos);
        if (!respawned) state.orbsAbsorbed += 1;
        addEnergy(orb.energyValue);
        bus.emit('orb:absorbed', {
          energy: orb.energyValue,
          x: worldPos.x,
          y: worldPos.y,
          z: worldPos.z,
        });
      }
    },
    markAbsorbed() {
      absorbed = true;
      mesh.visible = false;
    },
    respawn(newX: number, newZ: number, surfaceY: number, surfaceNormalY: number, energy: number) {
      absorbed = false;
      respawned = true;
      orb.energyValue = energy;
      bob = Math.atan2(newZ, newX) + 3;
      worldPos.set(newX, orbCenterY(surfaceY, ORB_RADIUS, 0, bob, surfaceNormalY), newZ);
      mesh.position.copy(worldPos);
      mesh.visible = true;
    },
    dispose() {
      scene.remove(mesh);
    },
  };
  return orb;
}

export function countVisibleOrbs(orbs: EnergyOrb[]): number {
  let n = 0;
  for (const o of orbs) {
    if (o.mesh.visible) n++;
  }
  return n;
}
