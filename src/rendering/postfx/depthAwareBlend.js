// src/rendering/postfx/depthAwareBlend.js
//
// Vendored + locally extended copy of three.js' depthAwareBlend TSL helper.
//
// Upstream source (three.js r184):
//   examples/jsm/tsl/display/depthAwareBlend.js
//   https://github.com/mrdoob/three.js/blob/dev/examples/jsm/tsl/display/depthAwareBlend.js
//
// Why this file exists:
//   The npm export `three/addons/tsl/display/depthAwareBlend.js` exists in
//   three@0.184.0, but it does NOT accept a per-pixel mask. We extend the
//   public API with an optional `options.maskFn(uvNode) => float` so the
//   godrays composite can attenuate the blend by the sky-luma mask without
//   touching the blend node itself. See PostFX.ts where `maskFn` is supplied.
//
// TODO(deps): drop this vendored copy and switch to
//   `import { depthAwareBlend } from 'three/addons/tsl/display/depthAwareBlend.js'`
//   when upstream lands a `maskFn` (or equivalent mask) option. Track the
//   three.js repo file for changes:
//   https://github.com/mrdoob/three.js/commits/dev/examples/jsm/tsl/display/depthAwareBlend.js

import {
  abs,
  array,
  color,
  Fn,
  float,
  If,
  int,
  ivec2,
  Loop,
  mix,
  nodeObject,
  normalize,
  perspectiveDepthToViewZ,
  reference,
  textureSize,
  uv,
  vec2,
  vec4,
  viewZToOrthographicDepth,
} from 'three/tsl';

/**
 * @param {import('three/tsl').Node} baseNode
 * @param {import('three/tsl').Node} blendNode
 * @param {import('three/tsl').Node} depthNode
 * @param {import('three').Camera} camera
 * @param {object} [options]
 */
export const depthAwareBlend = Fn(([baseNode, blendNode, depthNode, camera, options = {}]) => {
  const uvNode = baseNode.uvNode || uv();

  const cameraNear = reference('near', 'float', camera);
  const cameraFar = reference('far', 'float', camera);

  const blendColor = nodeObject(options.blendColor) || color(0xffffff);
  const edgeRadius = nodeObject(options.edgeRadius) || int(2);
  const edgeStrength = nodeObject(options.edgeStrength) || float(2);
  const maskFn = options.maskFn;

  const viewZ = perspectiveDepthToViewZ(depthNode, cameraNear, cameraFar);
  const correctDepth = viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);

  const pushDir = vec2(0.0).toVar();
  const count = float(0).toVar();

  const resolution = ivec2(textureSize(baseNode)).toConst();
  const pixelStep = vec2(1).div(resolution);

  const poissonDisk = array([
    vec2(0.493393, 0.394269),
    vec2(0.798547, 0.885922),
    vec2(0.259143, 0.650754),
    vec2(0.605322, 0.023588),
    vec2(-0.574681, 0.137452),
    vec2(-0.430397, -0.638423),
    vec2(-0.849487, -0.366258),
    vec2(0.170621, -0.569941),
  ]);

  Loop(8, ({ i }) => {
    const offset = poissonDisk.element(i).mul(edgeRadius);
    const sampleUv = uvNode.add(offset.mul(pixelStep));
    const sampleDepth = depthNode.sample(sampleUv);
    const sampleViewZ = perspectiveDepthToViewZ(sampleDepth, cameraNear, cameraFar);
    const sampleLinearDepth = viewZToOrthographicDepth(sampleViewZ, cameraNear, cameraFar);

    If(abs(sampleLinearDepth.sub(correctDepth)).lessThan(float(0.05).mul(correctDepth)), () => {
      pushDir.addAssign(offset);
      count.addAssign(1);
    });
  });

  count.assign(count.equal(0).select(1, count));
  pushDir.assign(normalize(pushDir.div(count)));

  const sampleUv = pushDir
    .length()
    .greaterThan(0)
    .select(uvNode.add(edgeStrength.mul(pushDir.div(resolution))), uvNode);

  const bestChoice = blendNode.sample(sampleUv).r;
  const pixelMask = maskFn ? maskFn(uvNode) : float(1);
  const blendFactor = bestChoice.mul(pixelMask);
  const baseColor = baseNode.sample(uvNode);

  return vec4(mix(baseColor, vec4(blendColor, 1), blendFactor));
});

/**
 * Depth-aware RGBA overlay composite — samples overlay RTT at edge-stabilized UV.
 * options.weight multiplies overlay alpha; compositeMode 0 = mix, 1 = additive (density debug).
 *
 * @param {import('three/tsl').Node} baseNode
 * @param {import('three/tsl').Node} overlayNode vec4 RTT (rgb + alpha)
 * @param {import('three/tsl').Node} depthNode
 * @param {import('three').Camera} camera
 * @param {object} [options]
 */
export const depthAwareColorBlend = Fn(([baseNode, overlayNode, depthNode, camera, options = {}]) => {
  const uvNode = baseNode.uvNode || uv();

  const cameraNear = reference('near', 'float', camera);
  const cameraFar = reference('far', 'float', camera);

  const edgeRadius = nodeObject(options.edgeRadius) || int(2);
  const edgeStrength = nodeObject(options.edgeStrength) || float(2);
  const weight = nodeObject(options.weight) || float(1);
  const compositeMode = nodeObject(options.compositeMode) || float(0);
  const maskFn = options.maskFn;

  const viewZ = perspectiveDepthToViewZ(depthNode, cameraNear, cameraFar);
  const correctDepth = viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);

  const pushDir = vec2(0.0).toVar();
  const count = float(0).toVar();

  const resolution = ivec2(textureSize(baseNode)).toConst();
  const pixelStep = vec2(1).div(resolution);

  const poissonDisk = array([
    vec2(0.493393, 0.394269),
    vec2(0.798547, 0.885922),
    vec2(0.259143, 0.650754),
    vec2(0.605322, 0.023588),
    vec2(-0.574681, 0.137452),
    vec2(-0.430397, -0.638423),
    vec2(-0.849487, -0.366258),
    vec2(0.170621, -0.569941),
  ]);

  Loop(8, ({ i }) => {
    const offset = poissonDisk.element(i).mul(edgeRadius);
    const sampleUv = uvNode.add(offset.mul(pixelStep));
    const sampleDepth = depthNode.sample(sampleUv);
    const sampleViewZ = perspectiveDepthToViewZ(sampleDepth, cameraNear, cameraFar);
    const sampleLinearDepth = viewZToOrthographicDepth(sampleViewZ, cameraNear, cameraFar);

    If(abs(sampleLinearDepth.sub(correctDepth)).lessThan(float(0.05).mul(correctDepth)), () => {
      pushDir.addAssign(offset);
      count.addAssign(1);
    });
  });

  count.assign(count.equal(0).select(1, count));
  pushDir.assign(normalize(pushDir.div(count)));

  const sampleUv = pushDir
    .length()
    .greaterThan(0)
    .select(uvNode.add(edgeStrength.mul(pushDir.div(resolution))), uvNode);

  const overlay = overlayNode.sample(sampleUv);
  const baseColor = baseNode.sample(uvNode);
  const pixelMask = maskFn ? maskFn(uvNode) : float(1);
  const alpha = overlay.a.mul(pixelMask).mul(weight);

  const mixedRgb = mix(baseColor.rgb, overlay.rgb, alpha);
  const addedRgb = baseColor.rgb.add(overlay.rgb.mul(alpha));
  const useAdd = compositeMode.greaterThan(0.5);
  const outRgb = useAdd.select(addedRgb, mixedRgb);

  return vec4(outRgb, baseColor.a);
});
