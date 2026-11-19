// src/rendering/underwater/underwaterShaftsTsl.ts — sunlight shafts in the water volume, added to the scene colour while the camera is under
import {
  dot,
  exp,
  float,
  fract,
  Loop,
  length,
  max,
  min,
  mix,
  perspectiveDepthToViewZ,
  pow,
  screenCoordinate,
  select,
  vec2,
  vec3,
} from 'three/tsl';
import {
  causticPatternTsl,
  surfaceEntryXzTsl,
  underwaterSurfaceYTsl,
  underwaterViewRayTsl,
} from './underwaterTsl';
import { underwaterUniforms as U } from './underwaterUniforms';

type TslNode = any;

/** Samples along a view ray, and how far (m) the ray is followed at most. */
const STEPS = 20;
const RANGE_M = 30;
/** Light scattered towards the camera per metre of lit water (a look value; `shafts.strength` scales it). */
const SCATTER = 0.04;

/**
 * Light added at `uv`: the sunlight that is really in the water along the view ray. The ray is marched in world space from
 * the game camera to whatever ends it (the seabed, the surface, 30 m); each sample asks where its sun ray crossed the
 * surface (`surfaceEntryXzTsl`) and reads the same caustic pattern the seabed uses there, so a shaft is a column of light
 * sitting in the water, slanted along the sun, ending on the caustic patch it makes on the floor. It stays put when the
 * camera moves. Brighter looking towards the sun (forward scatter), dimmer with every metre the light and the view travel.
 * Zero when `uShaftFade` is 0 (above water, sun down); the caller skips the call then.
 */
export function underwaterShaftsTsl(uv: TslNode, sceneDepth: TslNode): TslNode {
  // The ray's parameter `z` is the depth the depth buffer holds.
  const ray = underwaterViewRayTsl(uv).toVar();
  const rayLen = length(ray);
  const viewDir = ray.div(rayLen);
  const surfaceY = underwaterSurfaceYTsl().toVar();
  // Where the ray ends: at the surface when it points up, at what the depth buffer shows (sky and window = far plane), or at the range.
  const zSurf = select(ray.y.greaterThan(0.001), surfaceY.sub(U.uCamPos.y).div(ray.y), float(1e4));
  // The game camera's planes come from uniforms: `cameraNear`/`cameraFar` would be the post quad's camera here.
  const zScene = perspectiveDepthToViewZ(
    sceneDepth.sample(uv).r,
    U.uCameraNear,
    U.uCameraFar,
  ).abs();
  const zEnd = max(min(min(zScene, zSurf), float(RANGE_M).div(rayLen)), float(0)).toVar();
  // Interleaved gradient noise moves each pixel's samples along the ray, so the steps do not band.
  const jitter = fract(
    float(52.9829189).mul(fract(dot(screenCoordinate, vec2(0.06711056, 0.00583715)))),
  );

  const acc = float(0).toVar();
  Loop(STEPS, ({ i }: { i: TslNode }) => {
    const z = zEnd.mul(float(i).add(jitter)).div(STEPS);
    const p = U.uCamPos.add(ray.mul(z));
    const depth = max(surfaceY.sub(p.y), float(0));
    const entry = surfaceEntryXzTsl(vec2(p.x, p.z), depth);
    // Metres the sunlight travelled in the water to reach here, plus metres from here to the camera.
    const along = depth.div(max(U.uSunDirWater.y, float(0.15)));
    const lit = exp(along.add(z.mul(rayLen)).mul(U.uDensity).negate());
    acc.addAssign(causticPatternTsl(entry, true).mul(lit));
  });

  const phase = mix(float(0.3), float(1), pow(max(dot(viewDir, U.uSunDirWater), float(0)), 3));
  const tint = mix(U.uShallowColor, vec3(0.85, 1, 1), 0.6);
  return tint.mul(
    acc
      .mul(zEnd.mul(rayLen).div(STEPS))
      .mul(SCATTER)
      .mul(phase)
      .mul(U.uShaftStrength)
      .mul(U.uShaftFade),
  );
}
