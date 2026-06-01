// src/world/LandmarkProximity.ts
import type { Vector3 } from 'three';
import { bus } from '../core/EventBus';
import { addEnergy } from '../core/energy';
import { state } from '../core/GameState';
import { PHASE0, STONE_REQUIREMENTS } from '../config/phase0';
import { EMPTY_LANDMARK_LAYOUT, type MapLandmarkLayout } from './map/mapLandmarkLayout';

const triggeredMemories = new Set<number>();
const landmarkEnergyGranted = new Set<string>();
const stoneDwell = new Map<number, number>();
let templeDwell = 0;

let activeLayout: MapLandmarkLayout = EMPTY_LANDMARK_LAYOUT;

export function setLandmarkLayout(layout: MapLandmarkLayout): void {
  activeLayout = layout;
}

export function resetLandmarkLayout(): void {
  activeLayout = EMPTY_LANDMARK_LAYOUT;
}

function grantLandmarkEnergy(key: string, amount: number): void {
  if (landmarkEnergyGranted.has(key)) return;
  landmarkEnergyGranted.add(key);
  addEnergy(amount);
}

function distSqXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function canDiscoverStone(stoneId: number): boolean {
  const req = STONE_REQUIREMENTS[stoneId];
  if (!req) return true;
  if (req.requiresSpring && !landmarkEnergyGranted.has('spring')) return false;
  if (req.requiresTemple && !landmarkEnergyGranted.has('temple')) return false;
  return true;
}

export function checkWhisperAscension(): void {
  if (state.phase >= 1) return;
  if (state.energy < state.energyCap) return;
  if (state.stonesFound.size < PHASE0.WHISPER_MIN_STONES) return;
  state.phase = 1;
  bus.emit('memory:trigger', { id: PHASE0.AETHON_MEMORY_ID });
}

function updateStandingStones(px: number, pz: number, dt: number): void {
  const rSq = PHASE0.STONE_DWELL_RADIUS * PHASE0.STONE_DWELL_RADIUS;
  for (const stone of activeLayout.stones) {
    if (state.stonesFound.has(stone.id)) continue;
    if (!canDiscoverStone(stone.id)) continue;
    if (distSqXZ(px, pz, stone.x, stone.z) > rSq) {
      stoneDwell.delete(stone.id);
      continue;
    }
    const t = (stoneDwell.get(stone.id) ?? 0) + dt;
    stoneDwell.set(stone.id, t);
    if (t >= PHASE0.STONE_DWELL_TIME) {
      state.stonesFound.add(stone.id);
      addEnergy(PHASE0.LANDMARK_ENERGY.stone);
      bus.emit('stone:touched', { stoneId: stone.id });
      checkWhisperAscension();
    }
  }
}

function updateAncientOak(px: number, pz: number): void {
  const { x: ox, z: oz } = activeLayout.ancientOak;
  if (distSqXZ(px, pz, ox, oz) >= PHASE0.LANDMARK_RADIUS_SQ.oak) return;
  grantLandmarkEnergy('oak', PHASE0.LANDMARK_ENERGY.ancientOak);
  if (!triggeredMemories.has(4)) {
    triggeredMemories.add(4);
    bus.emit('memory:trigger', { id: 4 });
  }
}

function updateSacredSpring(px: number, pz: number): void {
  const { x: spX, z: spZ } = activeLayout.sacredSpring;
  if (distSqXZ(px, pz, spX, spZ) >= PHASE0.LANDMARK_RADIUS_SQ.spring) return;
  grantLandmarkEnergy('spring', PHASE0.LANDMARK_ENERGY.sacredSpring);
  if (!triggeredMemories.has(6)) {
    triggeredMemories.add(6);
    bus.emit('memory:trigger', { id: 6 });
  }
}

function updateDrownedTemple(px: number, pz: number, dt: number): void {
  const { x: tX, z: tZ } = activeLayout.drownedTemple;
  const approachSq = PHASE0.LANDMARK_RADIUS_SQ.templeApproach;
  const dwellSq = PHASE0.TEMPLE_DWELL_RADIUS * PHASE0.TEMPLE_DWELL_RADIUS;

  if (distSqXZ(px, pz, tX, tZ) < approachSq) {
    grantLandmarkEnergy('temple', PHASE0.LANDMARK_ENERGY.drownedTemple);
    if (!triggeredMemories.has(9)) {
      triggeredMemories.add(9);
      bus.emit('memory:trigger', { id: 9 });
    }
  }

  if (distSqXZ(px, pz, tX, tZ) >= dwellSq) {
    templeDwell = 0;
    return;
  }
  templeDwell += dt;
  if (templeDwell >= PHASE0.TEMPLE_DWELL_TIME && !triggeredMemories.has(13)) {
    triggeredMemories.add(13);
    bus.emit('memory:trigger', { id: 13 });
  }
}

function updateHighCairn(px: number, pz: number): void {
  const { x: cX, z: cZ } = activeLayout.highCairn;
  if (distSqXZ(px, pz, cX, cZ) >= PHASE0.LANDMARK_RADIUS_SQ.cairn) return;
  grantLandmarkEnergy('cairn', PHASE0.LANDMARK_ENERGY.highCairn);
  if (!triggeredMemories.has(11)) {
    triggeredMemories.add(11);
    bus.emit('memory:trigger', { id: 11 });
  }
}

export function updateLandmarkProximity(playerPosition: Vector3, dt: number): void {
  const px = playerPosition.x;
  const pz = playerPosition.z;
  updateStandingStones(px, pz, dt);
  updateAncientOak(px, pz);
  updateSacredSpring(px, pz);
  updateDrownedTemple(px, pz, dt);
  updateHighCairn(px, pz);
}
