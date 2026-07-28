// src/entities/PlayerController.ts — player movement, camera anchor, and glow light
import { type PointLight, type Scene, Vector3 } from 'three';
import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { WORLD } from '../config/world';
import { devDebugSettings } from '../core/GameState';
import { getMovementDirection } from '../core/InputManager';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { orbCenterY, orbHoverBaseY } from './orbFloat';
import { createOrbFootingSmoother } from './orbFootingSmooth';
import { sampleOrbTerrainFooting } from './orbTerrainFooting';
import { createPlayerVisuals } from './PlayerVisuals';
import type { MovementAxes } from './types';

const { PLAYER } = PHASE0;

/** Normalised-height band edge softness (worldY / HEIGHT_SCALE). */
const TERRAIN_SPEED_BAND = 0.1;

const _targetVelocity = new Vector3();

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function terrainSpeedMultiplier(h: number): number {
  const {
    BIOME_SLOWDOWN_HEIGHT_HIGH: high,
    BIOME_SLOWDOWN_HEIGHT_LOW: low,
    BIOME_SLOWDOWN_HEIGHT_MID: mid,
    BIOME_SLOWDOWN_HIGH_MUL: highMul,
    BIOME_SLOWDOWN_LOW_MUL: lowMul,
  } = PLAYER;
  const band = TERRAIN_SPEED_BAND;
  const shoreW = smoothstep(low, low + band, h) * (1 - smoothstep(mid - band, mid, h));
  const highW = smoothstep(high - band, high, h);
  const shoreSpeed = 1 + (lowMul - 1) * shoreW;
  return shoreSpeed + (highMul - shoreSpeed) * highW;
}

export interface PlayerControllerContext {
  /** Authoritative logic position (includes bob). Gameplay + orb pickup use this. */
  position: Vector3;
  /** Stable XZ + hover base Y for camera follow (no bob). */
  cameraAnchor: Vector3;
  playerLight: PointLight;
  /** Snapshot logic state at the start of each fixed step (for render interpolation). */
  beginFixedStep: () => void;
  /** Lerp prev→logic, write orb mesh group, return visual position scratch. */
  applyRenderPosition: (alpha: number) => Vector3;
  getRenderCameraAnchor: (alpha: number, out?: Vector3) => Vector3;
  update: (dt: number, viewAxes: MovementAxes) => void;
  updateIllumination: (targetRatio: number, dt: number) => void;
  dispose: () => void;
}

export function initPlayerController(
  scene: Scene,
  terrain: MapTerrainContext,
  startX: number,
  startZ: number,
): PlayerControllerContext {
  const visuals = createPlayerVisuals(scene);
  const group = visuals.group;

  const footingSmoother = createOrbFootingSmoother(
    terrain,
    PHASE0.ORB.PLAYER_RADIUS,
    VISUAL.player.orbFootingSmoothHz,
  );
  const startFooting = sampleOrbTerrainFooting(terrain, startX, startZ, PHASE0.ORB.PLAYER_RADIUS);
  footingSmoother.reset(startFooting);
  const logicPosition = new Vector3(
    startX,
    orbCenterY(startFooting.surfaceY, PHASE0.ORB.PLAYER_RADIUS, 0, 0, startFooting.normalY),
    startZ,
  );
  const prevPosition = new Vector3().copy(logicPosition);
  const renderPosition = new Vector3().copy(logicPosition);
  const cameraAnchor = new Vector3();
  const prevCameraAnchor = new Vector3();
  const velocity = new Vector3();

  group.position.copy(logicPosition);

  let elapsed = 0;
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

  const syncDerivedPose = (dt: number): void => {
    const footing = footingSmoother.sample(logicPosition.x, logicPosition.z, dt);
    cameraAnchor.set(
      logicPosition.x,
      orbHoverBaseY(footing.surfaceY, PHASE0.ORB.PLAYER_RADIUS, footing.normalY),
      logicPosition.z,
    );
    logicPosition.y = orbCenterY(
      footing.surfaceY,
      PHASE0.ORB.PLAYER_RADIUS,
      elapsed,
      0,
      footing.normalY,
    );
  };

  syncDerivedPose(0);
  prevCameraAnchor.copy(cameraAnchor);

  const beginFixedStep = (): void => {
    prevPosition.copy(logicPosition);
    prevCameraAnchor.copy(cameraAnchor);
  };

  const applyRenderPosition = (alpha: number): Vector3 => {
    const t = Math.max(0, Math.min(1, alpha));
    renderPosition.lerpVectors(prevPosition, logicPosition, t);
    group.position.copy(renderPosition);
    return renderPosition;
  };

  const getRenderCameraAnchor = (alpha: number, out = new Vector3()): Vector3 => {
    const t = Math.max(0, Math.min(1, alpha));
    return out.lerpVectors(prevCameraAnchor, cameraAnchor, t);
  };

  const update = (dt: number, viewAxes: MovementAxes) => {
    elapsed += dt;

    const dir = getMovementDirection();
    const hasInput = dir.x * dir.x + dir.y * dir.y > 0;

    let targetSpeed = 0;
    if (hasInput) {
      const worldY = terrain.getWorldY(logicPosition.x, logicPosition.z);
      const h = worldY / WORLD.HEIGHT_SCALE;
      targetSpeed =
        PLAYER.BASE_SPEED * terrainSpeedMultiplier(h) * devDebugSettings.movementSpeedMultiplier;
    }

    const forward = -dir.y;
    const strafe = dir.x;
    _targetVelocity.set(
      (viewAxes.forwardX * forward + viewAxes.rightX * strafe) * targetSpeed,
      0,
      (viewAxes.forwardZ * forward + viewAxes.rightZ * strafe) * targetSpeed,
    );

    const smooth = hasInput ? PLAYER.MOVEMENT_ACCEL_SMOOTH : PLAYER.MOVEMENT_DECEL_SMOOTH;
    const velT = 1 - Math.exp(-smooth * Math.max(dt, 0));
    velocity.lerp(_targetVelocity, velT);

    logicPosition.x += velocity.x * dt;
    logicPosition.z += velocity.z * dt;

    const half = WORLD.SIZE * PLAYER.WORLD_CLAMP_MARGIN;
    logicPosition.x = Math.max(-half, Math.min(half, logicPosition.x));
    logicPosition.z = Math.max(-half, Math.min(half, logicPosition.z));

    syncDerivedPose(dt);
    visuals.updatePulse(elapsed);
  };

  return {
    position: logicPosition,
    cameraAnchor,
    playerLight: visuals.playerLight,
    beginFixedStep,
    applyRenderPosition,
    getRenderCameraAnchor,
    update,
    updateIllumination,
    dispose: visuals.dispose,
  };
}
