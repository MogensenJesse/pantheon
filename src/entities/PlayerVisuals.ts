// src/entities/PlayerVisuals.ts — pulsing player orb, sparkle halo, and night point light
import { Group, Mesh, PointLight, type Scene, type Vector3 } from 'three';
import { PHASE0 } from '../config/phase0';
import type { OrganicOrbSettings } from '../config/visual/organicOrb';
import { VISUAL } from '../config/visualTuning';
import { getEnergyRatio } from '../core/energy';
import { GLOW_MESH_RENDER_ORDER } from '../rendering/glowMaterial';
import { enableWaterReflectionLayer } from '../rendering/layers/waterReflectionLayers';
import {
  getLiveOrganicOrbSettings,
  getOrganicOrbDevRevision,
} from './organicOrb/organicOrbDevState';
import { createOrganicOrbMaterial } from './organicOrb/organicOrbMaterial';
import { createOrganicOrbGeometry } from './organicOrb/organicOrbMesh';
import { createPlayerOrbParticles } from './playerOrbParticles';

const ORB_RADIUS = PHASE0.ORB.PLAYER_RADIUS;
const PULSE_AMP = 0.1;

export interface PlayerVisualsContext {
  group: Group;
  orb: Mesh;
  playerLight: PointLight;
  /** Smoothed energy [0,1] from the fixed step — mesh/rim/fill and the point light share this. */
  getDisplayEnergy: () => number;
  updatePulse: (elapsed: number, dt: number, velocity?: Vector3) => void;
  followSparkles: (worldPos: Vector3) => void;
  dispose: () => void;
}

function orbGrow(energyT: number): number {
  const min = VISUAL.player.orbScaleMin;
  return min + (1 - min) * energyT;
}

function orbRimHdr(energyT: number, cap: number): number {
  const min = VISUAL.player.orbEmissiveMin;
  return cap * (min + (1 - min) * energyT);
}

function orbFillWhite(energyT: number, cap: number): number {
  const min = VISUAL.player.orbFillWhiteMin;
  return min + (cap - min) * energyT;
}

export function createPlayerVisuals(scene: Scene): PlayerVisualsContext {
  const group = new Group();

  const organic = createOrganicOrbMaterial();
  const live0 = getLiveOrganicOrbSettings();
  const orbSettings: OrganicOrbSettings = { ...live0 };
  orbSettings.fillWhite = orbFillWhite(0, live0.fillWhite);
  organic.sync(orbSettings, orbRimHdr(0, live0.rimHdr));

  const orb = new Mesh(createOrganicOrbGeometry(ORB_RADIUS), organic.material);
  orb.renderOrder = GLOW_MESH_RENDER_ORDER;
  orb.scale.setScalar(orbGrow(0));
  enableWaterReflectionLayer(orb);
  group.add(orb);

  const playerLight = new PointLight(
    0xffffff,
    PHASE0.PLAYER.LIGHT_INTENSITY_MIN,
    PHASE0.PLAYER.LIGHT_DISTANCE_MIN,
  );
  playerLight.decay = 1;
  group.add(playerLight);

  const sparkles = createPlayerOrbParticles(group);
  sparkles.setShellScale(orbGrow(0));

  scene.add(group);

  let displayEnergy = 0;
  let syncedEnergy = 0;
  let syncedLookRev = getOrganicOrbDevRevision();
  let stretchVX = 0;
  let stretchVZ = 0;
  let stretchX = 1;
  let stretchZ = 0;

  const updatePulse = (elapsed: number, dt: number, velocity?: Vector3) => {
    const target = getEnergyRatio();
    const { illuminationGrowSmooth, illuminationShrinkSmooth } = VISUAL.player;
    const smooth = target >= displayEnergy ? illuminationGrowSmooth : illuminationShrinkSmooth;
    displayEnergy += (target - displayEnergy) * (1 - Math.exp(-smooth * Math.max(dt, 0)));
    const grow = orbGrow(displayEnergy);
    const pulse = Math.sin(elapsed * PHASE0.PLAYER.PULSE_SPEED);
    orb.scale.setScalar(grow * (1 + PULSE_AMP * pulse));
    const live = getLiveOrganicOrbSettings();
    const lookRev = getOrganicOrbDevRevision();
    if (Math.abs(displayEnergy - syncedEnergy) > 1e-5 || lookRev !== syncedLookRev) {
      syncedEnergy = displayEnergy;
      syncedLookRev = lookRev;
      Object.assign(orbSettings, live);
      orbSettings.fillWhite = orbFillWhite(displayEnergy, live.fillWhite);
      organic.sync(orbSettings, orbRimHdr(displayEnergy, live.rimHdr));
    }
    if (velocity) {
      const speed = Math.hypot(velocity.x, velocity.z);
      const ref = Math.max(live.stretchSpeedRef, 0.25);
      const stretchTarget = Math.min(1, speed / ref);
      let tx = 0;
      let tz = 0;
      let nx = stretchX;
      let nz = stretchZ;
      if (speed > 0.08) {
        nx = velocity.x / speed;
        nz = velocity.z / speed;
        tx = nx * stretchTarget;
        tz = nz * stretchTarget;
      }
      const curLen = Math.hypot(stretchVX, stretchVZ);
      const headingDot =
        curLen > 0.02 && speed > 0.08 ? (stretchVX * nx + stretchVZ * nz) / curLen : 1;
      const respond =
        headingDot < 0 ? Math.max(live.stretchTurnSmooth, 0.5) : stretchTarget > curLen ? 16 : 5;
      const k = 1 - Math.exp(-respond * Math.max(dt, 0));
      stretchVX += (tx - stretchVX) * k;
      stretchVZ += (tz - stretchVZ) * k;
      const len = Math.hypot(stretchVX, stretchVZ);
      if (len > 1e-4) {
        stretchX = stretchVX / len;
        stretchZ = stretchVZ / len;
        organic.setMotion(stretchX, stretchZ, Math.min(1, len));
      } else {
        organic.setMotion(stretchX, stretchZ, 0);
      }
    }
    sparkles.setShellScale(grow);
    if (import.meta.env.DEV) sparkles.syncUniforms();
  };

  const dispose = () => {
    sparkles.dispose();
    scene.remove(group);
    orb.geometry.dispose();
    organic.dispose();
  };

  return {
    group,
    orb,
    playerLight,
    getDisplayEnergy: () => displayEnergy,
    updatePulse,
    followSparkles: sparkles.follow,
    dispose,
  };
}
