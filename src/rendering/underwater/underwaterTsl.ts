// src/rendering/underwater/underwaterTsl.ts — water volume maths for TSL: fog on the view ray, depth colour, caustics, the ceiling seen from below
import {
  abs,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  dot,
  exp,
  Fn,
  float,
  frontFacing,
  If,
  length,
  max,
  min,
  mix,
  normalize,
  positionWorld,
  pow,
  screenSize,
  screenUV,
  select,
  sin,
  smoothstep,
  sqrt,
  vec2,
  vec3,
  vec4,
  viewportSafeUV,
} from 'three/tsl';
import { WORLD } from '../../config/world';
import { waterWaveUniforms } from '../../world/water/material/waterWaveUniforms';
import { waterCurrentHeightAtXzTsl } from '../../world/water/tsl/waterTideTsl';
import { CRITICAL_COS, WATER_INDEX } from './underwaterMath';
import { underwaterUniforms as U } from './underwaterUniforms';

type TslNode = any;

/** World Y of the water surface right now (base level plus the tide bob; the bob is the same everywhere). */
export function underwaterSurfaceYTsl(): TslNode {
  return waterCurrentHeightAtXzTsl(waterWaveUniforms.uWaterY, waterWaveUniforms);
}

/**
 * Metres of the straight segment from -> to that lie below `surfaceY`. Mirror: `underwaterPathM` in underwaterMath.ts.
 * Camera above looking down at a seabed: the depth along the ray. Camera below: the whole ray up to the surface.
 */
export function underwaterPathMTsl(from: TslNode, to: TslNode, surfaceY: TslNode): TslNode {
  const yc = from.y.sub(surfaceY);
  const yp = to.y.sub(surfaceY);
  const dist = length(to.sub(from));
  const below = max(yc.negate(), float(0)).add(max(yp.negate(), float(0)));
  const span = max(yc.sub(yp).abs(), float(1e-4));
  return dist.mul(below.div(span).clamp(0, 1));
}

/** Fog colour of a ray whose camera end and far end are at these depths: shallow near the surface, deep far down. */
export function underwaterColorAtDepthTsl(meanDepthM: TslNode): TslNode {
  const t = float(1).sub(exp(max(meanDepthM, float(0)).negate().div(U.uDeepM)));
  return mix(U.uShallowColor, U.uDeepColor, t);
}

/**
 * Fog of the segment camera -> `to` (a fragment's world position): `factor` is the share of the fragment replaced by `color`.
 * `factor` is 0 for rays that never touch the water and when the volume is switched off.
 */
export function underwaterFogTsl(to: TslNode = positionWorld): { factor: TslNode; color: TslNode } {
  const surfaceY = underwaterSurfaceYTsl();
  const path = underwaterPathMTsl(cameraPosition, to, surfaceY);
  const factor = float(1)
    .sub(exp(path.negate().mul(U.uDensity)))
    .mul(U.uEnabled);
  const depthFrom = max(surfaceY.sub(cameraPosition.y), float(0));
  const depthTo = max(surfaceY.sub(to.y), float(0));
  return { factor, color: underwaterColorAtDepthTsl(depthFrom.add(depthTo).mul(0.5)) };
}

const TAU = Math.PI * 2;

/** One family of wavy bright lines (1 on the lines, 0 between): a plane wave at `angle`, bent by a second wave across it. */
function causticRidgeTsl(
  q: TslNode,
  angle: number,
  freq: number,
  t: TslNode,
  speed: number,
  bend: number,
): TslNode {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rx = q.x.mul(c).sub(q.y.mul(s)).mul(freq);
  const rz = q.x.mul(s).add(q.y.mul(c)).mul(freq);
  const across = sin(rz.mul(TAU * 0.63).sub(t.mul(speed * 0.7))).mul(bend);
  return float(1).sub(abs(sin(rx.mul(TAU).add(t.mul(speed)).add(across))));
}

/**
 * Caustic pattern, 0..1: three families of wavy lines at different angles and spacings, bent by a slow domain warp, so it
 * never repeats (the old interference loop was one tile repeated every `scaleM` metres and changed character over time).
 * Patchy brightness on top breaks up its evenness. No texture, about 15 sines. `xz` is world XZ.
 * `uCausticWidth` sets the line thickness: the painterly pass smears thin lines away.
 * `lite` leaves out the third family (about 40 % cheaper) for the light shafts, which sample it a dozen times per pixel.
 */
export function causticPatternTsl(xz: TslNode, lite = false): TslNode {
  const t = U.uClock.mul(U.uCausticSpeed);
  const q0 = xz.div(U.uCausticScaleM);
  const warpX = sin(q0.y.mul(0.83).add(t.mul(0.9)))
    .add(sin(q0.x.mul(0.37).sub(t.mul(0.6))).mul(0.8))
    .add(sin(q0.x.add(q0.y).mul(1.3).add(t)).mul(0.5));
  const warpZ = sin(q0.x.mul(0.97).sub(t.mul(0.8)))
    .add(sin(q0.y.mul(0.41).add(t.mul(0.5))).mul(0.8))
    .add(sin(q0.x.sub(q0.y).mul(1.1).sub(t.mul(1.2))).mul(0.5));
  const q = q0.add(vec2(warpX, warpZ).mul(0.28));
  const a = causticRidgeTsl(q, 0, 1, t, 1.7, 1.6);
  const b = causticRidgeTsl(q.add(vec2(3.1, -1.7)), 1.13, 1.37, t, -1.4, 1.9);
  let net = pow(a, 3.0).add(pow(b, 3.0));
  if (lite) net = net.mul(0.82);
  else {
    const c = causticRidgeTsl(q.add(vec2(-5.3, 2.9)), -0.71, 0.79, t, 1.1, 1.4);
    net = net.add(pow(c, 3.0)).mul(0.55);
  }
  // The shafts want broad soft curtains: their few samples per metre would alias a thin line into grain.
  const lo = lite ? float(0) : mix(float(0.45), float(0.05), U.uCausticWidth);
  const lines = smoothstep(lo, lo.add(lite ? 0.9 : 0.55), net);
  // Big irregular patches of brighter and dimmer light, in metres (not tied to the pattern's cell).
  const patch = sin(xz.x.mul(0.19).add(1.3).add(t.mul(0.2)))
    .add(sin(xz.y.mul(0.23).sub(0.7)))
    .add(sin(xz.x.add(xz.y).mul(0.11).add(t.mul(0.15))))
    .div(3.0);
  return lines.mul(patch.mul(0.325).add(0.675));
}

/**
 * World XZ where the sun's light crossed the surface to reach the point `xz` that lies `depth` m under it. The pattern
 * lives on the surface (the wavelets focus the light), so the floor caustics and the light shafts both read it here:
 * a beam of light then runs from its patch of surface down to the caustic it makes on the floor, slanted like the sun.
 */
export function surfaceEntryXzTsl(xz: TslNode, depth: TslNode): TslNode {
  const sun = U.uSunDirWater;
  return xz.add(vec2(sun.x, sun.z).mul(depth.div(max(sun.y, float(0.15)))));
}

/**
 * Extra light on sunlit ground under the surface, as a scalar to multiply the surface albedo by and add:
 * pattern x sun visibility x facing, fading in below the surface and out with depth. 0 above water.
 */
export const underwaterCausticLightTsl = Fn(
  ([worldPos, normal, sunDirection, sunVisibility]: TslNode[]) => {
    const out = float(0).toVar();
    // Gated with a real branch: above the water (most pixels) the pattern's maths is skipped.
    If(
      worldPos.y
        .lessThan(underwaterSurfaceYTsl())
        .and(U.uEnabled.greaterThan(0.5))
        .and(U.uCausticStrength.greaterThan(0.001)),
      () => {
        const depth = max(underwaterSurfaceYTsl().sub(worldPos.y), float(0));
        const inWater = smoothstep(float(0), float(0.35), depth);
        const fade = exp(depth.negate().div(U.uCausticFadeM));
        const facing = max(dot(normal, sunDirection), float(0)).mul(0.65).add(0.35);
        out.assign(
          causticPatternTsl(surfaceEntryXzTsl(vec2(worldPos.x, worldPos.z), depth))
            .mul(U.uCausticStrength)
            .mul(inWater)
            .mul(fade)
            .mul(facing)
            .mul(sunVisibility)
            .mul(U.uDaylight),
        );
      },
    );
    return out;
  },
);

/**
 * The surface seen from below (a water back face): a window onto the world above, total internal reflection (the water's
 * own colour) outside it. The view ray is bent by the rippled surface and the already-rendered scene is sampled where the
 * bent ray points (`viewportScene`, the same copy the surface uses from above), so sky, shore and trees show through,
 * squeezed towards the rim like a fish-eye. `viewDir` points from the camera to the fragment, `surfaceNormal` is up-ish.
 */
export function underwaterCeilingColorTsl(
  viewDir: TslNode,
  surfaceNormal: TslNode,
  viewportScene: TslNode,
): TslNode {
  // `If` needs a shader-function scope, so the whole colour is one Fn.
  return Fn(() => {
    const surfaceY = underwaterSurfaceYTsl();
    const dist = length(positionWorld.sub(cameraPosition));
    const camDepth = max(surfaceY.sub(cameraPosition.y), float(0));
    const fogColor = underwaterColorAtDepthTsl(camDepth);
    const out: TslNode = fogColor.mul(0.9).toVar('underwaterCeilingOut');
    // Back faces only: above the water this stays the fog colour and the projection and the fetch are skipped.
    If(frontFacing.not(), () => {
      const edge = U.uWindowEdgeCos;
      const n = normalize(mix(vec3(0, 1, 0), surfaceNormal, U.uWindowRipple));
      const cosT = max(dot(viewDir, n), float(0));
      const window = smoothstep(edge.sub(U.uWindowEdgeSoft), edge.add(U.uWindowEdgeSoft), cosT);
      // The window's cone [edge, 1] is mapped onto the real Snell cone, so the horizon squeezes into its rim at any window size.
      const cosEff = cosT
        .sub(edge)
        .div(max(float(1).sub(edge), float(1e-3)))
        .clamp(0, 1);
      const cosWater = mix(float(CRITICAL_COS), float(1), cosEff);
      const sinAir = min(
        sqrt(max(float(1).sub(cosWater.mul(cosWater)), float(0))).mul(WATER_INDEX),
        float(1),
      );
      const cosAir = sqrt(max(float(1).sub(sinAir.mul(sinAir)), float(0)));
      const tangent = viewDir.sub(n.mul(dot(viewDir, n)));
      const sideways = tangent.div(max(length(tangent), float(1e-4)));
      const refracted = normalize(sideways.mul(sinAir).add(n.mul(cosAir)));
      // Where the bent ray lands on screen: project a far point along it (WebGPU screenUV is top-left, NDC is y-up).
      const far = positionWorld.add(refracted.mul(2000));
      const clip = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(far, 1));
      const ndc = clip.xy.div(max(clip.w, float(1e-4)));
      const uv = vec2(ndc.x.mul(0.5).add(0.5), float(0.5).sub(ndc.y.mul(0.5)));
      // Near the picture's edge the bent ray lands off-screen: ease back to this pixel's own unbent ray (always on screen),
      // so the window has no rectangular frame.
      const edgeBlend = smoothstep(float(0.7), float(1), max(abs(ndc.x), abs(ndc.y)));
      const ownUv = screenUV.add(n.xz.mul(0.03));
      const world = viewportScene.sample(viewportSafeUV(mix(uv, ownUv, edgeBlend))).rgb;
      const reach = exp(dist.mul(U.uDensity).mul(0.5).negate());
      out.assign(mix(fogColor.mul(0.9), world.mul(U.uWindowGlow), window.mul(reach)));
    });
    return out;
  })();
}

/**
 * World-space view ray of the game camera at screen `uv`, scaled so its forward part is 1: its parameter is then the view
 * depth the depth buffer holds. For post passes, where the camera nodes are the full-screen quad's, so it reads `uCam*`.
 */
export function underwaterViewRayTsl(uv: TslNode): TslNode {
  return U.uCamFwd
    .add(U.uCamRight.mul(uv.x.mul(2).sub(1).mul(U.uCamTan.x)))
    .add(U.uCamUp.mul(float(1).sub(uv.y.mul(2)).mul(U.uCamTan.y)));
}

const MAP_HALF_M = WORLD.SIZE / 2;

/** Distance along a horizontal ray, from coordinate `c` with direction `d` on one axis, to the map's edge on that side. */
function mapEdgeDistanceTsl(c: TslNode, d: TslNode): TslNode {
  return select(
    d.greaterThan(0),
    float(MAP_HALF_M)
      .sub(c)
      .div(max(d, float(1e-4))),
    float(-MAP_HALF_M)
      .sub(c)
      .div(min(d, float(-1e-4))),
  );
}

/**
 * What shows where nothing is drawn under water: below the horizon, past the terrain mesh's edge (the map ends at about 1 km
 * with a flat sea floor), only the sky would show. Such a ray never meets the surface or the ground, so it is water all the way
 * and `color` is the water's fog colour. It is the ceiling's colour at the horizontal and, linearly in the angle, the colour
 * the far terrain gets at the map edge's floor depth at the angle where the terrain's edge is: the sea floor seems to run on
 * to the horizon with no seam at either end. `weight` is 1 on pixels with nothing drawn (depth at the far plane, or next to
 * such a pixel: silhouette pixels are blended with the sky) whose ray does not rise, scaled by how far the camera is under.
 * Replaces the pixel: transparents without depth (orb halo, motes) over those pixels are lost.
 */
export function underwaterVoidFillTsl(
  uv: TslNode,
  sceneDepth: TslNode,
): { weight: TslNode; color: TslNode } {
  const dir: TslNode = normalize(underwaterViewRayTsl(uv));
  const flat = dir.xz;
  const surfaceY = underwaterSurfaceYTsl();
  const camDepth = max(surfaceY.sub(U.uCamPos.y), float(0));
  const floorDepth = max(surfaceY.sub(U.uEdgeFloorY), camDepth);
  // Angle (as a tangent) below the horizontal, against the angle at which the terrain's edge floor is seen along this ray.
  const toEdge = max(
    min(mapEdgeDistanceTsl(U.uCamPos.x, flat.x), mapEdgeDistanceTsl(U.uCamPos.z, flat.y)),
    float(1),
  );
  const tanDown = max(dir.y.negate(), float(0)).div(max(length(flat), float(1e-4)));
  const tanEdge = max(floorDepth.sub(camDepth).div(toEdge), float(1e-4));
  const ramp = tanDown.div(tanEdge).clamp(0, 1);
  const endDepth = mix(camDepth, floorDepth, ramp);
  // The ceiling is drawn at 0.9 of the fog colour, the terrain at 1.
  const shade = mix(float(0.9), float(1), ramp);
  const color = underwaterColorAtDepthTsl(camDepth.add(endDepth).mul(0.5)).mul(shade);
  const px = vec2(0, 1.5).div(screenSize);
  const farthest = max(
    sceneDepth.sample(uv).r,
    max(sceneDepth.sample(uv.add(px)).r, sceneDepth.sample(uv.sub(px)).r),
  );
  const nothingDrawn = select(farthest.greaterThan(0.999999), float(1), float(0));
  const weight = nothingDrawn
    .mul(float(1).sub(smoothstep(float(0), float(0.004), dir.y)))
    .mul(U.uSubmerge)
    .mul(U.uEnabled);
  return { weight, color };
}
