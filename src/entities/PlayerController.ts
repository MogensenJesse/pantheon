// src/entities/PlayerController.ts — player movement, camera anchor, and glow light
import { type PointLight, type Scene, Vector3 } from 'three';
import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { devSettings } from '../core/GameState';
import { getMovementDirection } from '../core/InputManager';
import type { TerrainContext } from '../world/TerrainGenerator';
import { WORLD } from '../world/WorldConfig';
import { orbCenterY, orbHoverBaseY } from './orbFloat';
import { createPlayerVisuals } from './PlayerVisuals';
import type { MovementAxes } from './types';

const { PLAYER } = PHASE0;

function terrainSpeedMultiplier(h: number): number {
  if (h >= PLAYER.BIOME_SLOWDOWN_HEIGHT_HIGH) return PLAYER.BIOME_SLOWDOWN_HIGH_MUL;
  if (h >= PLAYER.BIOME_SLOWDOWN_HEIGHT_LOW && h < PLAYER.BIOME_SLOWDOWN_HEIGHT_MID) {
    return PLAYER.BIOME_SLOWDOWN_LOW_MUL;
  }
  return 1;
}

export interface PlayerControllerContext {
  /** Visual orb position (includes bob). */
  position: Vector3;
  /** Stable XZ + hover base Y for camera follow (no bob). */
  cameraAnchor: Vector3;
  playerLight: PointLight;
  update: (dt: number, viewAxes: MovementAxes) => void;
  updateIllumination: (targetRatio: number, dt: number) => void;
  dispose: () => void;
}

export function initPlayerController(
  scene: Scene,
  terrain: TerrainContext,
  startX: number,
  startZ: number,
): PlayerControllerContext {
  const visuals = createPlayerVisuals(scene);
  const group = visuals.group;
  group.position.set(
    startX,
    orbCenterY(terrain.getWorldY(startX, startZ), PHASE0.ORB.PLAYER_RADIUS, 0),
    startZ,
  );

  const position = group.position;
  const cameraAnchor = new Vector3();
  let elapsed = 0;
  let wasMoving = false;
  let displayIlluminationRatio = 0;

  const applyIlluminationRatio = (ratio: number): void => {
    const r = Math.max(0, Math.min(1, ratio));
    visuals.playerLight.distance = PLAYER.LIGHT_DISTANCE_MIN + r * PLAYER.LIGHT_DISTANCE_GAIN;
    visuals.playerLight.intensity = PLAYER.LIGHT_INTENSITY_MIN + r * PLAYER.LIGHT_INTENSITY_GAIN;
  };

  const updateIllumination = (targetRatio: number, dt: number): void => {
    const target = Math.max(0, Math.min(1, targetRatio));
    const { illuminationGrowSmooth, illuminationShrinkSmooth } = VISUAL.player;
    const smooth =
      target >= displayIlluminationRatio ? illuminationGrowSmooth : illuminationShrinkSmooth;
    const t = 1 - Math.exp(-smooth * Math.max(dt, 0));
    displayIlluminationRatio += (target - displayIlluminationRatio) * t;
    applyIlluminationRatio(displayIlluminationRatio);
  };

  const update = (dt: number, viewAxes: MovementAxes) => {
    elapsed += dt;

    let worldY = terrain.getWorldY(position.x, position.z);
    const dir = getMovementDirection();
    const moving = dir.lengthSq() > 0;
    if (moving) {
      const h = worldY / WORLD.HEIGHT_SCALE;
      const speed =
        PLAYER.BASE_SPEED * terrainSpeedMultiplier(h) * devSettings.movementSpeedMultiplier;
      const forward = -dir.y;
      const strafe = dir.x;
      position.x += (viewAxes.forwardX * forward + viewAxes.rightX * strafe) * speed * dt;
      position.z += (viewAxes.forwardZ * forward + viewAxes.rightZ * strafe) * speed * dt;

      const half = WORLD.SIZE * PLAYER.WORLD_CLAMP_MARGIN;
      position.x = Math.max(-half, Math.min(half, position.x));
      position.z = Math.max(-half, Math.min(half, position.z));
      worldY = terrain.getWorldY(position.x, position.z);
    }

    cameraAnchor.set(position.x, orbHoverBaseY(worldY, PHASE0.ORB.PLAYER_RADIUS), position.z);
    position.y = orbCenterY(worldY, PHASE0.ORB.PLAYER_RADIUS, elapsed);

    visuals.updatePulse(elapsed);

    if (moving || wasMoving) {
      visuals.updateOrbit(position, elapsed);
    }
    wasMoving = moving;
  };

  return {
    position,
    cameraAnchor,
    playerLight: visuals.playerLight,
    update,
    updateIllumination,
    dispose: visuals.dispose,
  };
}
