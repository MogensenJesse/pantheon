// src/entities/PlayerVisuals.ts — pulsing player orb, sparkle halo, and night point light
import { Group, Mesh, PointLight, type Scene, SphereGeometry, type Vector3 } from 'three';
import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { createGlowNodeMaterial, GLOW_MESH_RENDER_ORDER } from '../rendering/glowMaterial';
import { disableWaterReflectionLayer } from '../rendering/layers/waterReflectionLayers';
import { createPlayerOrbParticles } from './playerOrbParticles';

const ORB_RADIUS = PHASE0.ORB.PLAYER_RADIUS;

export interface PlayerVisualsContext {
  group: Group;
  orb: Mesh;
  playerLight: PointLight;
  updatePulse: (elapsed: number) => void;
  followSparkles: (worldPos: Vector3) => void;
  dispose: () => void;
}

export function createPlayerVisuals(scene: Scene): PlayerVisualsContext {
  const group = new Group();
  disableWaterReflectionLayer(group);

  const orb = new Mesh(
    new SphereGeometry(ORB_RADIUS, 24, 24),
    createGlowNodeMaterial({
      colorHex: 0xffffff,
      emissiveHex: 0xffffff,
      emissiveIntensity: VISUAL.bloom.PLAYER_EMISSIVE,
    }),
  );
  orb.renderOrder = GLOW_MESH_RENDER_ORDER;
  group.add(orb);

  const playerLight = new PointLight(
    0xffffff,
    PHASE0.PLAYER.LIGHT_INTENSITY_MIN,
    PHASE0.PLAYER.LIGHT_DISTANCE_MIN,
  );
  playerLight.decay = 1;
  group.add(playerLight);

  const sparkles = createPlayerOrbParticles(group);

  scene.add(group);

  const updatePulse = (elapsed: number) => {
    const pulse = Math.sin(elapsed * PHASE0.PLAYER.PULSE_SPEED);
    orb.scale.setScalar(1 + 0.1 * pulse);
    if (import.meta.env.DEV) sparkles.syncUniforms();
  };

  const dispose = () => {
    sparkles.dispose();
    scene.remove(group);
    orb.geometry.dispose();
    orb.material.dispose();
  };

  return {
    group,
    orb,
    playerLight,
    updatePulse,
    followSparkles: sparkles.follow,
    dispose,
  };
}
