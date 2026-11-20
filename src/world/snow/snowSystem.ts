// src/world/snow/snowSystem.ts — deep snow: the baked hull, the clipmap shell, the tracks field and the orb's furrow, once a frame
import { type DirectionalLight, type Scene, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import { sunDirectionFromSpherical } from '../../rendering/sunSpherical';
import { weatherLook } from '../../rendering/weather/weatherLook';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import { slopeRockDerivedFromNormalY } from '../terrain/config/terrainBiomeTuning';
import { bakeSnow } from './cpu/snowBake';
import { setActiveSnowDepth, snowDepthAt } from './cpu/snowDepth';
import { bankDecayTime, decayFactor, recentreAxis } from './cpu/snowFieldMath';
import { walkStride } from './cpu/snowStride';
import { createSnowEmitters, type SnowEmitterSources } from './snowEmitters';
import { createSnowField, MAX_BRUSHES_PER_FRAME } from './snowField';
import { createSnowMaps } from './snowMaps';
import { createSnowShellMaterial } from './snowShellMaterial';
import { createSnowSurfaceMesh } from './snowSurfaceMesh';

export interface SnowSystem {
  /** Once a frame with the player's position: moves the shell, stamps the orb's furrow along its path, draws the queued brushes. */
  update: (frameDelta: number, orb: Vector3) => void;
  /** Queue one orb-sized brush (heading defaults to the orb's last). */
  stamp: (x: number, z: number, dirX?: number, dirZ?: number) => void;
  /** Bake the static snow again from the live terrain and tuning (also runs once, the first frame the shell is on); ms taken. */
  rebake: () => number;
  /** What the shell costs (triangles, the last bake in ms, 0 = not baked yet) and where the tracks window sits. */
  stats: () => {
    triangles: number;
    bakeMs: number;
    fieldCentre: { x: number; z: number };
    bankS: number;
    /** Brushes stamped since the page loaded (the orb's and the walkers'). */
    brushesDrawn: number;
  };
  dispose: () => void;
}

const NO_WALKERS: SnowEmitterSources = { villagers: () => null, sheepWithin: null };

export function createSnowSystem(opts: {
  scene: Scene;
  renderer: WebGPURenderer;
  sun: DirectionalLight;
  terrain: Pick<MapTerrainContext, 'splatMaterial' | 'getWorldY'>;
  /** Called when the snow depth gameplay sees changes (shell on or off, re-bake): the grass map must be filled again. */
  onDepthChange?: () => void;
  /** Whose footprints besides the orb's (villagers, sheep); omitted = the orb only. */
  walkers?: SnowEmitterSources;
}): SnowSystem {
  const cfg = VISUAL.snow;
  const { splatMaterial, getWorldY } = opts.terrain;
  const field = createSnowField(cfg.field.windowM, cfg.field.res);
  const maps = createSnowMaps(Math.round(WORLD.SIZE / cfg.bake.texelM), cfg.bake.texelM);
  const material = createSnowShellMaterial({
    terrain: splatMaterial,
    sun: opts.sun,
    field,
    maps,
  });
  const surface = createSnowSurfaceMesh(material, cfg.shell);
  opts.scene.add(surface.mesh);
  const walkers = createSnowEmitters(field.queue, snowDepthAt, opts.walkers ?? NO_WALKERS);

  let bakeMs = 0;
  let depthMap: Parameters<typeof setActiveSnowDepth>[0] = null;
  /** Whether the depth is published to gameplay and the grass (follows `cfg.enabled`). */
  let depthActive = false;
  const publishDepth = (on: boolean): void => {
    if (on === depthActive) return;
    depthActive = on;
    setActiveSnowDepth(on ? depthMap : null);
    opts.onDepthChange?.();
  };
  const rebake = (): number => {
    const t0 = performance.now();
    const aspect = VISUAL.terrain.snow.aspect;
    const sun = sunDirectionFromSpherical(
      aspect.referenceElevationDeg,
      aspect.referenceAzimuthDeg,
      new Vector3(),
    );
    const bake = bakeSnow({
      size: maps.size,
      texelM: maps.texelM,
      chiselY: getWorldY,
      slopeRock: slopeRockDerivedFromNormalY,
      heightScale: WORLD.HEIGHT_SCALE,
      tune: VISUAL.terrain.snow,
      sunDir: [sun.x, sun.y, sun.z],
      thicknessM: cfg.thicknessM,
    });
    maps.update(bake);
    // gameplay and the grass read the same depth the shell draws (only while the shell is on, see `update`)
    depthMap = { size: bake.size, texelM: bake.texelM, depth: bake.depth };
    if (depthActive) {
      setActiveSnowDepth(depthMap);
      opts.onDepthChange?.();
    }
    bakeMs = performance.now() - t0;
    if (import.meta.env.DEV) console.info(`[snow] baked ${maps.size}^2 in ${bakeMs.toFixed(0)} ms`);
    return bakeMs;
  };

  let albedo: string = cfg.albedo;
  /** The field window's centre (NaN until the shell first runs) and the frame time not yet applied as fade. */
  const centre = { x: Number.NaN, z: Number.NaN };
  let bank = 0;
  /** Where the orb last left a print; NaN until the shell is on. */
  const lastPrint = { x: Number.NaN, z: 0 };
  let headX = 0;
  let headZ = 1;
  let brushesDrawn = 0;
  /** How much faster the prints fill in now: falling snow rebuilds them. */
  const snowfallPace = (): number => 1 + cfg.refill.snowfallMul * weatherLook.snow01;
  const stamp = (x: number, z: number, dirX = headX, dirZ = headZ) =>
    field.queue({
      x,
      z,
      halfA: cfg.orb.halfA,
      halfB: cfg.orb.halfB,
      dirX,
      dirZ,
      depthM: cfg.orb.depthM,
      bermM: cfg.orb.bermM,
    });

  return {
    stamp,
    rebake,
    stats: () => ({
      triangles: surface.triangles,
      bakeMs,
      fieldCentre: { ...centre },
      bankS: bank,
      brushesDrawn,
    }),
    update: (frameDelta, orb) => {
      surface.mesh.visible = cfg.enabled;
      // the shell paints the snow where it is on; the terrain's own snow colour steps aside
      splatMaterial.terrainUniforms.uSnowSplatMul.value = cfg.enabled ? 0 : 1;
      if (!cfg.enabled) {
        publishDepth(false);
        lastPrint.x = Number.NaN;
        walkers.reset();
        bank += frameDelta * snowfallPace(); // time passes for the prints while the shell is off
        return;
      }
      if (bakeMs === 0) rebake();
      publishDepth(true);
      if (cfg.albedo !== albedo) {
        albedo = cfg.albedo;
        material.uAlbedo.value.set(albedo);
      }
      material.uCam.value.set(orb.x, orb.z);
      // upkeep: recentre the window on the orb (clearing what entered) and fade the prints, in one pass
      const { snapM, hysteresisM } = cfg.field;
      const next = {
        x: recentreAxis(centre.x, orb.x, snapM, hysteresisM),
        z: recentreAxis(centre.z, orb.z, snapM, hysteresisM),
      };
      const taken = bankDecayTime(bank, frameDelta * snowfallPace(), cfg.refill.passS);
      bank = taken.bank;
      const moved = !Number.isNaN(centre.x) && (next.x !== centre.x || next.z !== centre.z);
      if (moved || taken.apply > 0) {
        const from = Number.isNaN(centre.x) ? next : centre;
        field.maintain(
          opts.renderer,
          from,
          next,
          decayFactor(taken.apply, cfg.refill.depressionTauS),
          decayFactor(taken.apply, cfg.refill.bermTauS),
        );
      }
      centre.x = next.x;
      centre.z = next.z;
      if (cfg.autoTrail) {
        walkStride(lastPrint, orb, cfg.orb.strideM, MAX_BRUSHES_PER_FRAME, (x, z, dirX, dirZ) => {
          headX = dirX;
          headZ = dirZ;
          stamp(x, z, dirX, dirZ);
        });
      } else {
        lastPrint.x = Number.NaN;
      }
      if (cfg.walkerTracks) {
        // farther than this from the orb a print would wrap round the window (see `field` in config/visual/snow.ts)
        walkers.update(frameDelta, orb, cfg.field.windowM / 2 - cfg.field.hysteresisM);
      } else {
        walkers.reset();
      }
      brushesDrawn += field.flush(opts.renderer);
    },
    dispose: () => {
      walkers.reset();
      setActiveSnowDepth(null);
      splatMaterial.terrainUniforms.uSnowSplatMul.value = 1;
      surface.dispose();
      material.dispose();
      maps.dispose();
      field.dispose();
    },
  };
}
