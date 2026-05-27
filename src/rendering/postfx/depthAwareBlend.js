// Vendored from three.js dev examples/jsm/tsl/display/depthAwareBlend.js (r184 npm lacks this addon).
import {
  abs,
  array,
  color,
  float,
  Fn,
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
