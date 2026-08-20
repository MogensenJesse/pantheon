// src/entities/energyOrb/orbSystem.ts — residue orb visual bootstrap + per-tick update

import alea from 'alea';
import type { Scene, Vector3 } from 'three';
import { PHASE0 } from '../../config/phase0';
import type { OrganicOrbSettings } from '../../config/visual/organicOrb';
import { VISUAL } from '../../config/visualTuning';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import { createEnergyOrbParticles } from '../energyOrbParticles';
import { sampleOrbTerrainFooting } from '../orbTerrainFooting';
import {
  getLiveOrganicOrbSettings,
  getOrganicOrbDevRevision,
} from '../organicOrb/organicOrbDevState';
import { createOrganicOrbMaterial } from '../organicOrb/organicOrbMaterial';
import { createOrganicOrbGeometry } from '../organicOrb/organicOrbMesh';
import { createEnergyOrb, type EnergyOrb, type OrbPlacement } from './energyOrb';

const { ENERGY_RADIUS: ORB_RADIUS, RNG_SEED } = PHASE0.ORB;

export interface InitOrbSystemOptions {
  placements: OrbPlacement[];
}

export interface OrbSystemContext {
  orbs: EnergyOrb[];
  update: (playerPos: Vector3, dt: number) => void;
  dispose: () => void;
}

export function initOrbSystem(
  scene: Scene,
  terrain: MapTerrainContext,
  options: InitOrbSystemOptions,
): OrbSystemContext {
  const rng = alea(`${RNG_SEED}-orbs`);
  const organic = createOrganicOrbMaterial();
  organic.setMorphOriginMul(VISUAL.energyOrb.morphOriginMul);
  const residueLook: OrganicOrbSettings = {
    ...getLiveOrganicOrbSettings(),
    ...VISUAL.energyOrb.look,
  };
  organic.sync(residueLook);
  let residueLookRev = getOrganicOrbDevRevision();
  const orbGeometry = createOrganicOrbGeometry(ORB_RADIUS);

  const slotPlacements = options.placements;
  if (slotPlacements.length === 0) {
    throw new Error('initOrbSystem requires at least one orb placement from the map.');
  }

  const sparkles = createEnergyOrbParticles(scene, slotPlacements.length);

  const spawnTerrainY = new Float32Array(slotPlacements.length);
  const spawnNormalY = new Float32Array(slotPlacements.length);
  const orbs: EnergyOrb[] = [];
  for (let i = 0; i < slotPlacements.length; i++) {
    const slot = slotPlacements[i];
    const x = slot.x;
    const z = slot.z;
    const footing = sampleOrbTerrainFooting(terrain, x, z, ORB_RADIUS);
    spawnTerrainY[i] = footing.surfaceY;
    spawnNormalY[i] = footing.normalY;
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

    const lookRev = getOrganicOrbDevRevision();
    if (lookRev !== residueLookRev) {
      residueLookRev = lookRev;
      Object.assign(residueLook, getLiveOrganicOrbSettings(), VISUAL.energyOrb.look);
      organic.sync(residueLook);
    }
    sparkles.update(elapsed, playerPos);
    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i]!;
      if (orb.absorbed) continue;
      orb.updateFloat(spawnTerrainY[i]!, elapsed, spawnNormalY[i]!);
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
