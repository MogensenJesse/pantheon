// @ts-nocheck — TSL node typings incomplete in three r186
// src/world/village/render/windowGlowMaterial.ts — additive warm window light with a gentle flicker
import { AdditiveBlending, DoubleSide } from 'three';
import {
  attribute,
  cameraFar,
  cameraNear,
  float,
  fract,
  positionView,
  positionWorld,
  sin,
  vec2,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { uVillageGlow, uVillageTime } from './villageUniforms';

/** Brighter than the vertex colour so lit windows pop and catch bloom. */
const GLOW_GAIN = 1.8;
/** Matches the props' pull toward the camera, plus a little so the quads win against their walls. */
const DEPTH_PULL_M = 0.45 + 0.08;

export function createWindowGlowMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.name = 'village_window_glow';
  material.lights = false;
  material.fog = false;
  material.side = DoubleSide;
  material.transparent = true;
  material.depthWrite = false;
  material.blending = AdditiveBlending;

  // One flicker phase per window: quantise the world position to roughly window spacing.
  const cell = vec2(positionWorld.x, positionWorld.z).div(1.3).floor();
  const phase = fract(sin(cell.x.mul(12.9898).add(cell.y.mul(78.233))).mul(43758.5453));
  const flicker = float(0.86)
    .add(sin(uVillageTime.mul(7).add(phase.mul(30))).mul(0.08))
    .add(sin(uVillageTime.mul(13).add(phase.mul(70))).mul(0.05));

  material.colorNode = attribute('color', 'vec3').mul(uVillageGlow).mul(flicker).mul(GLOW_GAIN);
  material.depthNode = viewZToPerspectiveDepth(
    positionView.z.add(float(DEPTH_PULL_M)),
    cameraNear,
    cameraFar,
  );
  return material;
}
