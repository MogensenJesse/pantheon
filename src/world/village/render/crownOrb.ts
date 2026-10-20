// src/world/village/render/crownOrb.ts — the player's orb floating above a building's roof, fed by the village's faith
import { Group, Mesh, Vector3 } from 'three';
import { PHASE0 } from '../../../config/phase0';
import type { OrganicOrbSettings } from '../../../config/visual/organicOrb';
import { VISUAL } from '../../../config/visualTuning';
import { getEnergyRatio } from '../../../core/energy';
import { clamp01 } from '../../../core/math/scalar';
import { orbFillWhite, orbGrow, orbRimHdr } from '../../../entities/organicOrb/orbEnergyLook';
import {
  getLiveOrganicOrbSettings,
  getOrganicOrbDevRevision,
} from '../../../entities/organicOrb/organicOrbDevState';
import { createOrganicOrbMaterial } from '../../../entities/organicOrb/organicOrbMaterial';
import { createOrganicOrbGeometry } from '../../../entities/organicOrb/organicOrbMesh';
import { createPlayerOrbParticles } from '../../../entities/playerOrbParticles';
import { GLOW_MESH_RENDER_ORDER } from '../../../rendering/glowMaterial';
import { enableWaterReflectionLayer } from '../../../rendering/layers/waterReflectionLayers';
import { createCrownBeam } from './crownBeam';
import { createCrownColumn } from './crownColumn';
import { crownTuning } from './crownTuning';

const LOOK = VISUAL.village.CROWN_ORB;
const COLUMN = VISUAL.village.CROWN_COLUMN;
const PULSE_AMP = 0.1;

export interface CrownOrbs {
  /** Hover an orb `crownHeight` m above the floor point (x, floorY, z); the centre of its bob. */
  add: (x: number, floorY: number, z: number, crownHeight: number) => void;
  /**
   * `faith`: the faith the village has gathered over its life. The orbs stay hidden until the player first reaches
   * 100% energy; the faith gathered after that moment grows them.
   */
  update: (elapsed: number, dt: number, faith: number) => void;
  dispose: () => void;
}

interface Crown {
  group: Group;
  mesh: Mesh;
  /** Floor point under the orb: where the light column stands. */
  floor: Vector3;
  y: number;
  sparkles: ReturnType<typeof createPlayerOrbParticles>;
  beam: ReturnType<typeof createCrownBeam>;
  column: ReturnType<typeof createCrownColumn>;
}

/**
 * One shared orb material and sphere, with the player's look. Faith runs the player's 0..100% energy ramp
 * (size, rim, fill, particles) up to FULL_FAITH, then adds particles and strengthens the beam up to MAX_FAITH.
 */
export function createCrownOrbs(parent: Group): CrownOrbs {
  const organic = createOrganicOrbMaterial();
  const geometry = createOrganicOrbGeometry(PHASE0.ORB.PLAYER_RADIUS);
  const crowns: Crown[] = [];
  const settings: OrganicOrbSettings = { ...getLiveOrganicOrbSettings() };
  let shown = -1;
  let syncedT = -1;
  let syncedRev = -1;
  let particleFraction = 0;
  /** Faith total when the player first reached 100% energy; null until then. */
  let baseline: number | null = null;

  return {
    add: (x, floorY, z, crownHeight) => {
      const y = floorY + crownHeight;
      const group = new Group();
      group.position.set(x, y, z);
      const mesh = new Mesh(geometry, organic.material);
      mesh.renderOrder = GLOW_MESH_RENDER_ORDER;
      enableWaterReflectionLayer(mesh);
      group.add(mesh);
      parent.add(group);
      const sparkles = createPlayerOrbParticles(group, {
        capacityMul: LOOK.MAX_PARTICLE_MUL,
        drawFraction: () => particleFraction,
      });
      const beam = createCrownBeam(parent);
      group.visible = baseline !== null;
      beam.setVisible(baseline !== null);
      crowns.push({
        group,
        mesh,
        floor: new Vector3(x, floorY, z),
        y,
        sparkles,
        beam,
        column: createCrownColumn(parent),
      });
    },
    update: (elapsed, dt, totalFaith) => {
      if (baseline === null) {
        if (getEnergyRatio() < 1) return;
        baseline = totalFaith;
        for (const crown of crowns) {
          crown.group.visible = true;
          crown.beam.setVisible(true);
        }
      }
      const faith = totalFaith - baseline;
      const { illuminationGrowSmooth, illuminationShrinkSmooth } = VISUAL.player;
      const smooth =
        shown < 0 || faith >= shown ? illuminationGrowSmooth : illuminationShrinkSmooth;
      shown =
        shown < 0 ? faith : shown + (faith - shown) * (1 - Math.exp(-smooth * Math.max(dt, 0)));
      const t = clamp01(shown / LOOK.FULL_FAITH);
      const extra = clamp01((shown - LOOK.FULL_FAITH) / (LOOK.MAX_FAITH - LOOK.FULL_FAITH));
      particleFraction = t + extra * (LOOK.MAX_PARTICLE_MUL - 1);
      const grow = orbGrow(t);
      const columnGrowth = clamp01((shown - LOOK.MAX_FAITH) / (COLUMN.FULL_FAITH - LOOK.MAX_FAITH));

      const rev = getOrganicOrbDevRevision();
      if (Math.abs(t - syncedT) > 1e-5 || rev !== syncedRev) {
        syncedT = t;
        syncedRev = rev;
        const live = getLiveOrganicOrbSettings();
        Object.assign(settings, live);
        settings.fillWhite = orbFillWhite(t, live.fillWhite);
        organic.sync(settings, orbRimHdr(t, live.rimHdr));
      }

      const bob = Math.sin((elapsed * 2 * Math.PI) / LOOK.BOB_PERIOD_S) * LOOK.BOB_M;
      const pulse = 1 + PULSE_AMP * Math.sin(elapsed * PHASE0.PLAYER.PULSE_SPEED);
      for (const crown of crowns) {
        crown.group.position.y = crown.y + bob;
        crown.mesh.scale.setScalar(crownTuning.orbScale * grow * pulse);
        crown.sparkles.setShellScale(crownTuning.orbScale * grow);
        crown.sparkles.follow(crown.group.position);
        if (import.meta.env.DEV) crown.sparkles.syncUniforms();
        crown.beam.update(crown.group.position, clamp01(shown / LOOK.MAX_FAITH));
        crown.column.update(crown.floor, columnGrowth);
      }
    },
    dispose: () => {
      for (const crown of crowns) {
        crown.column.dispose();
        crown.beam.dispose();
        crown.sparkles.dispose();
        parent.remove(crown.group);
      }
      crowns.length = 0;
      geometry.dispose();
      organic.dispose();
    },
  };
}
