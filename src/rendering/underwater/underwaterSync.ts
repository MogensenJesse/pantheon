// src/rendering/underwater/underwaterSync.ts — per-frame drive of the water volume uniforms (settings, time of day, camera depth, light shafts)
import type { PerspectiveCamera } from 'three';
import { Color, MathUtils, Vector3 } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import { currentSunAzimuthDeg, sunDirectionFromSpherical } from '../sunSpherical';
import { sampleTodColor } from '../tod/todBlend';
import { apparentSunElevationDeg } from './underwaterMath';
import { underwaterUniforms as U, underwaterSettings } from './underwaterUniforms';

const _shallow = new Color();
const _deep = new Color();
const _back = new Vector3();

/** Share of the camera's depth under the surface, 0 above it, 1 once `submergeFadeM` below. Pass the mean level plus the swell height at the camera (waves/waveMath.ts): CPU-side use. */
export function submergeAmount(cameraY: number, waterY: number): number {
  return MathUtils.clamp((waterY - cameraY) / VISUAL.underwater.submergeFadeM, 0, 1);
}

/** World Y of the sea floor where the terrain mesh ends (mean of the four edge midpoints). Call once, after the terrain exists. */
export function mapEdgeFloorY(getWorldY: (x: number, z: number) => number): number {
  const e = WORLD.SIZE / 2 - 1;
  return (getWorldY(e, 0) + getWorldY(-e, 0) + getWorldY(0, e) + getWorldY(0, -e)) / 4;
}

/** The game camera for the post pass (its own camera nodes are the full-screen quad's): position, axes, field of view, planes. */
function syncCamera(camera: PerspectiveCamera): void {
  camera.updateMatrixWorld();
  (U.uCamPos.value as Vector3).setFromMatrixPosition(camera.matrixWorld);
  camera.matrixWorld.extractBasis(U.uCamRight.value as Vector3, U.uCamUp.value as Vector3, _back);
  (U.uCamFwd.value as Vector3).copy(_back).negate();
  const tanY = Math.tan(MathUtils.degToRad(camera.fov) / 2);
  (U.uCamTan.value as { set: (x: number, y: number) => void }).set(tanY * camera.aspect, tanY);
  U.uCameraNear.value = camera.near;
  U.uCameraFar.value = camera.far;
}

/**
 * Push the live settings and the time-of-day colours to the GPU, advance the caustic clock, note how far the camera is
 * under, and aim the sun's light in the water. Cheap enough to run every frame; the dev panel only writes `underwaterSettings`.
 */
export function syncUnderwater(
  elevationDeg: number,
  daylight: number,
  camera: PerspectiveCamera,
  waterY: number,
  dt: number,
  edgeFloorY: number,
): void {
  const s = underwaterSettings;
  U.uEdgeFloorY.value = edgeFloorY;
  U.uEnabled.value = s.enabled ? 1 : 0;
  U.uDensity.value = s.density;
  U.uDeepM.value = s.deepM;
  U.uCausticStrength.value = s.causticStrength;
  U.uCausticScaleM.value = s.causticScaleM;
  U.uCausticSpeed.value = s.causticSpeed;
  U.uCausticWidth.value = s.causticWidth;
  U.uCausticFadeM.value = s.causticFadeM;
  U.uShaftStrength.value = s.shaftStrength;
  U.uWindowGlow.value = s.windowGlow;
  U.uWindowEdgeCos.value = s.windowEdgeCos;
  U.uWindowEdgeSoft.value = s.windowEdgeSoft;
  U.uWindowRipple.value = s.windowRipple;
  U.uRippleAmp.value = s.rippleAmp;
  U.uRippleScale.value = s.rippleScale;
  U.uRippleSpeed.value = s.rippleSpeed;
  U.uOrbTint.value = s.orbTint;
  sampleTodColor(
    {
      night: s.stops.night.shallow,
      goldenHour: s.stops.goldenHour.shallow,
      noon: s.stops.noon.shallow,
    },
    elevationDeg,
    _shallow,
  );
  sampleTodColor(
    { night: s.stops.night.deep, goldenHour: s.stops.goldenHour.deep, noon: s.stops.noon.deep },
    elevationDeg,
    _deep,
  );
  (U.uShallowColor.value as Color).copy(_shallow);
  (U.uDeepColor.value as Color).copy(_deep);
  U.uDaylight.value = MathUtils.clamp(daylight, 0, 1);
  U.uClock.value = (U.uClock.value as number) + dt;
  const submerge = submergeAmount(camera.position.y, waterY);
  U.uSubmerge.value = submerge;
  // The sun in the water is needed above water too: the floor caustics slant along it. A sun at or under the horizon
  // is parked at the horizon's refracted spot (it is dark then anyway), so the direction never flips.
  sunDirectionFromSpherical(
    apparentSunElevationDeg(Math.max(elevationDeg, 0.01), s.windowEdgeCos),
    currentSunAzimuthDeg(),
    U.uSunDirWater.value as Vector3,
  );
  // The shaft maths only matters (and is only drawn) while the camera is under.
  if (submerge > 0.001) {
    syncCamera(camera);
    U.uShaftFade.value = submerge * MathUtils.smoothstep(elevationDeg, 0, 8) * U.uDaylight.value;
  } else U.uShaftFade.value = 0;
}
