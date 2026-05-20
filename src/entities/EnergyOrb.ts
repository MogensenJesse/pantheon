// src/entities/EnergyOrb.ts
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from 'three';
import alea from 'alea';
import { bus } from '../core/EventBus';
import { state } from '../core/GameState';
import { PHASE0 } from '../config/phase0';
import { enableBloomLayer } from '../rendering/bloomLayer';
import { checkWhisperAscension } from '../world/LandmarkProximity';
import { buildJourneyOrbPlacements } from '../world/JourneyPath';
import { WORLD } from '../world/WorldConfig';
import type { TerrainContext } from '../world/TerrainGenerator';

const ABSORB_RADIUS_SQ = 1.5 * 1.5;
const BURST_DURATION = 0.4;

function createOrbGlowTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 230, 80, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 160, 30, 0.75)');
  gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

export class EnergyOrb {
  readonly mesh: Points;
  readonly worldPos: Vector3;
  readonly energyValue: number;
  absorbed = false;

  private readonly _scene: Scene;
  private burstMesh: Points | null = null;
  private burstAge = 0;

  constructor(scene: Scene, position: Vector3, energyValue: number, material: PointsMaterial) {
    this._scene = scene;
    this.worldPos = position.clone();
    this.energyValue = energyValue;

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([position.x, position.y, position.z], 3),
    );

    this.mesh = new Points(geometry, material);
    enableBloomLayer(this.mesh);
    scene.add(this.mesh);
  }

  checkAbsorption(playerPos: Vector3): void {
    if (this.absorbed) return;
    const dx = playerPos.x - this.worldPos.x;
    const dz = playerPos.z - this.worldPos.z;
    const dy = playerPos.y - this.worldPos.y;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < ABSORB_RADIUS_SQ) {
      this.absorbed = true;
      this.mesh.visible = false;
      this._spawnBurst();
      state.energy = Math.min(state.energyCap, state.energy + this.energyValue);
      bus.emit('orb:absorbed', { energy: this.energyValue, pos: this.worldPos.clone() });
      bus.emit('energy:changed', { energy: state.energy, cap: state.energyCap });
      checkWhisperAscension();
    }
  }

  updateBurst(dt: number): void {
    if (!this.burstMesh) return;
    this.burstAge += dt;
    const t = Math.min(1, this.burstAge / BURST_DURATION);
    const mat = this.burstMesh.material as PointsMaterial;
    mat.size = 1.2 + t * 5.0;
    mat.opacity = 1 - t;
    if (t >= 1) {
      this._scene.remove(this.burstMesh);
      this.burstMesh.geometry.dispose();
      mat.dispose();
      this.burstMesh = null;
    }
  }

  private _spawnBurst(): void {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute([this.worldPos.x, this.worldPos.y, this.worldPos.z], 3),
    );
    const mat = new PointsMaterial({
      color: 0xffc840,
      size: 1.2,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.burstMesh = new Points(geo, mat);
    this.burstAge = 0;
    this._scene.add(this.burstMesh);
  }
}

export interface OrbSystemContext {
  orbs: EnergyOrb[];
  update: (playerPos: Vector3, dt: number) => void;
  dispose: () => void;
}

export function initOrbSystem(scene: Scene, terrain: TerrainContext): OrbSystemContext {
  const rng = alea(`${WORLD.SEED}-orbs`);
  const orbGlowTexture = createOrbGlowTexture();

  const material = new PointsMaterial({
    map: orbGlowTexture,
    color: 0xffc840,
    size: 0.9,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const placements = buildJourneyOrbPlacements(
    PHASE0.ORB_COUNT,
    rng,
    terrain,
    WORLD.JOURNEY.PATH_HALF_WIDTH * 0.55,
  );

  const orbs: EnergyOrb[] = [];
  for (const { x, z } of placements) {
    const y = terrain.getWorldY(x, z) + 0.35;
    const energyValue = 3 + Math.floor(rng() * 5);
    orbs.push(new EnergyOrb(scene, new Vector3(x, y, z), energyValue, material));
  }

  let elapsed = 0;

  const update = (playerPos: Vector3, dt: number) => {
    elapsed += dt;
    material.size = 0.75 + 0.25 * Math.sin(elapsed * 2.5);

    for (const orb of orbs) {
      if (orb.absorbed) {
        orb.updateBurst(dt);
        continue;
      }
      orb.checkAbsorption(playerPos);
    }
  };

  const dispose = () => {
    orbGlowTexture.dispose();
    material.dispose();
    for (const orb of orbs) {
      scene.remove(orb.mesh);
      orb.mesh.geometry.dispose();
    }
  };

  return { orbs, update, dispose };
}
