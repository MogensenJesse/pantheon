// src/world/village/render/villageTerrainLayers.ts — building footprints in the terrain's grass, contact-shade and path layers
import type { DataTexture } from 'three';
import { VILLAGE } from '../../../config/village';
import { VISUAL } from '../../../config/visualTuning';
import { smoothstep01 } from '../../../core/math/scalar';
import type { GridDirtyRegion } from '../../../map/authoring/gridDirtyRegion';
import { type GridTextureGpu, uploadDataTextureRegion } from '../../../map/MapGrids';
import { getLiveTerrainAoBakeSettings } from '../../mapProps/data/propContactAoDevState';
import { WORLD } from '../../WorldConfig';
import type { Building } from '../model/types';
import type { WearField } from '../sim/wearField';

export interface VillageTerrainLayersOptions {
  renderer: GridTextureGpu;
  pathMap: DataTexture;
  aoMap: DataTexture;
  /** Null when the map has no grass. */
  exclusionMap: DataTexture | null;
  requestGrassCompact: (() => void) | null;
  /** Footstep wear, folded into the path layer and the grass layer. */
  wear: WearField;
  centerX: number;
  centerZ: number;
  radiusM: number;
}

export interface VillageTerrainLayers {
  /** Mark a building's footprint: grass cleared, ground shaded around it, a worn yard. */
  stampBuilding: (building: Building) => void;
  /** Clear the grass under a field. */
  stampField: (field: Footprint) => void;
  /** Founding pass, before the textures are first drawn: write everything with plain full uploads. */
  commitFull: () => void;
  /** Re-compose the path and grass layers over a world rectangle whose wear changed. */
  applyWear: (rect: { x0: number; z0: number; x1: number; z1: number }) => void;
  /** Upload pending changes, at most once per interval per layer. Call once per frame. */
  flush: (dt: number) => void;
  /** Re-apply the village's contact shade over the AO layer after a DEV re-bake rewrote it. */
  reapplyAo: (buildings: readonly Building[]) => void;
}

const LOOK = VISUAL.village.TERRAIN;

/** Texels per side of one dirty tile: the unit that is composed and uploaded. */
const TILE = LOOK.TILE_TEXELS;
/** Tiles composed and uploaded per layer per frame while a sweep runs. */
const TILES_PER_FRAME = Math.max(1, Math.floor(LOOK.UPLOAD_TEXELS_PER_FRAME / (TILE * TILE)));

/** min layers darken or clear (255 = untouched); max layers add (0 = untouched). */
type Blend = 'min' | 'max';

interface Layer {
  blend: Blend;
  texture: DataTexture;
  data: Uint8Array;
  texSize: number;
  /** Texel count spanning the world; node-centred textures span one fewer than their size. */
  across: number;
  /** 0.5 for cell-centred textures, 0 for node-centred. */
  center: number;
  /** Village square in texels. */
  i0: number;
  j0: number;
  size: number;
  base: Uint8Array;
  stamped: Uint8Array;
  /** Extra value at a world position (255-scale) blended like the stamps, or null. */
  wearValue: ((x: number, z: number) => number) | null;
  /** Tiles (TILE texels per side, counted from the village square's corner) waiting to be composed and uploaded. */
  dirtyTiles: Set<number>;
  tilesAcross: number;
  /** A tile sweep is under way: keep uploading each frame until the set is empty. */
  sweeping: boolean;
  sinceUpload: number;
}

/** Stable 0..1 value per half-metre cell, for ragged edges. */
function hashNoise(x: number, z: number): number {
  const v = Math.sin(Math.round(x * 2) * 12.9898 + Math.round(z * 2) * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function toTexel(layer: Layer, world: number): number {
  return (world / WORLD.SIZE + 0.5) * layer.across - layer.center;
}

function toWorld(layer: Layer, texel: number): number {
  return ((texel + layer.center) / layer.across - 0.5) * WORLD.SIZE;
}

function createLayer(
  texture: DataTexture,
  blend: Blend,
  nodeCentred: boolean,
  o: Pick<VillageTerrainLayersOptions, 'centerX' | 'centerZ' | 'radiusM'>,
  wearValue: Layer['wearValue'] = null,
): Layer {
  const texSize = texture.image.width;
  const across = nodeCentred ? texSize - 1 : texSize;
  const layer = {
    blend,
    texture,
    data: texture.image.data as Uint8Array,
    texSize,
    across,
    center: nodeCentred ? 0 : 0.5,
    i0: 0,
    j0: 0,
    size: 0,
    base: new Uint8Array(0),
    stamped: new Uint8Array(0),
    wearValue,
    dirtyTiles: new Set<number>(),
    tilesAcross: 0,
    sweeping: false,
    sinceUpload: Number.POSITIVE_INFINITY,
  } satisfies Layer as Layer;
  const half = o.radiusM + VILLAGE.WEAR.MARGIN_M;
  layer.i0 = Math.max(0, Math.floor(toTexel(layer, o.centerX - half)));
  layer.j0 = Math.max(0, Math.floor(toTexel(layer, o.centerZ - half)));
  const i1 = Math.min(texSize - 1, Math.ceil(toTexel(layer, o.centerX + half)));
  const j1 = Math.min(texSize - 1, Math.ceil(toTexel(layer, o.centerZ + half)));
  layer.size = Math.max(i1 - layer.i0, j1 - layer.j0) + 1;
  layer.tilesAcross = Math.ceil(layer.size / TILE);
  snapshotBase(layer);
  layer.stamped = new Uint8Array(layer.size * layer.size).fill(blend === 'min' ? 255 : 0);
  return layer;
}

/** Copy the live texture over the village square as the "nothing built" layer. */
function snapshotBase(layer: Layer): void {
  layer.base = new Uint8Array(layer.size * layer.size);
  for (let j = 0; j < layer.size; j++) {
    for (let i = 0; i < layer.size; i++) {
      const ti = layer.i0 + i;
      const tj = layer.j0 + j;
      layer.base[j * layer.size + i] =
        ti < layer.texSize && tj < layer.texSize ? layer.data[tj * layer.texSize + ti]! : 255;
    }
  }
}

/** Queue every tile the texel rectangle touches. */
function markDirty(layer: Layer, r: GridDirtyRegion): void {
  const ti1 = Math.min(layer.tilesAcross - 1, Math.floor((r.iMax - layer.i0) / TILE));
  const tj1 = Math.min(layer.tilesAcross - 1, Math.floor((r.jMax - layer.j0) / TILE));
  for (let tj = Math.max(0, Math.floor((r.jMin - layer.j0) / TILE)); tj <= tj1; tj++) {
    for (let ti = Math.max(0, Math.floor((r.iMin - layer.i0) / TILE)); ti <= ti1; ti++) {
      layer.dirtyTiles.add(tj * layer.tilesAcross + ti);
    }
  }
}

/** Texel rectangle of a tile, clipped to the texture; empty (max < min) outside it. */
function tileRegion(layer: Layer, tile: number): GridDirtyRegion {
  const ti = tile % layer.tilesAcross;
  const tj = (tile - ti) / layer.tilesAcross;
  const iMin = layer.i0 + ti * TILE;
  const jMin = layer.j0 + tj * TILE;
  const iEnd = Math.min(layer.i0 + layer.size, layer.texSize);
  const jEnd = Math.min(layer.j0 + layer.size, layer.texSize);
  return {
    iMin,
    jMin,
    iMax: Math.min(iMin + TILE, iEnd) - 1,
    jMax: Math.min(jMin + TILE, jEnd) - 1,
  };
}

/** What a stamp needs of a building or a field. */
type Footprint = Pick<Building, 'x' | 'z' | 'rotY' | 'halfW' | 'halfD'>;

interface Stamp {
  /** Fully affected margin beyond the plinth pad (m). */
  core: number;
  /** Distance over which the effect fades out (m). */
  fade: number;
  /** Strength 0..255 for max layers. */
  strength: number;
}

/** Stamp a smooth rounded rectangle around the building's pad into one layer. */
function stampLayer(layer: Layer, b: Footprint, s: Stamp): void {
  const cos = Math.cos(b.rotY);
  const sin = Math.sin(b.rotY);
  const ex = b.halfW + VILLAGE.PLINTH.PAD_M + s.core;
  const ez = b.halfD + VILLAGE.PLINTH.PAD_M + s.core;
  const reach = Math.hypot(ex, ez) + s.fade;
  const iMin = Math.max(layer.i0, Math.floor(toTexel(layer, b.x - reach)));
  const iMax = Math.min(
    layer.i0 + layer.size - 1,
    layer.texSize - 1,
    Math.ceil(toTexel(layer, b.x + reach)),
  );
  const jMin = Math.max(layer.j0, Math.floor(toTexel(layer, b.z - reach)));
  const jMax = Math.min(
    layer.j0 + layer.size - 1,
    layer.texSize - 1,
    Math.ceil(toTexel(layer, b.z + reach)),
  );
  if (iMax < iMin || jMax < jMin) return;
  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      const dx = toWorld(layer, i) - b.x;
      const dz = toWorld(layer, j) - b.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const outside = Math.hypot(Math.max(Math.abs(lx) - ex, 0), Math.max(Math.abs(lz) - ez, 0));
      const v = outside <= 0 ? 1 : 1 - smoothstep01(outside / s.fade);
      if (v <= 0) continue;
      const index = (j - layer.j0) * layer.size + (i - layer.i0);
      layer.stamped[index] =
        layer.blend === 'min'
          ? Math.min(layer.stamped[index]!, Math.round(255 * (1 - v)))
          : Math.max(layer.stamped[index]!, Math.round(s.strength * v));
    }
  }
  markDirty(layer, { iMin, iMax, jMin, jMax });
}

/** Write base combined with the stamps into the live texture over `r`. */
function compose(layer: Layer, r: GridDirtyRegion): void {
  for (let j = r.jMin; j <= r.jMax; j++) {
    for (let i = r.iMin; i <= r.iMax; i++) {
      const index = (j - layer.j0) * layer.size + (i - layer.i0);
      const base = layer.base[index]!;
      const stamped = layer.stamped[index]!;
      const worn = layer.wearValue
        ? layer.wearValue(toWorld(layer, i), toWorld(layer, j))
        : layer.blend === 'min'
          ? 255
          : 0;
      layer.data[j * layer.texSize + i] =
        layer.blend === 'min' ? Math.min(base, stamped, worn) : Math.max(base, stamped, worn);
    }
  }
}

export function createVillageTerrainLayers(o: VillageTerrainLayersOptions): VillageTerrainLayers {
  const TERRAIN = LOOK;
  const { WEAR } = VILLAGE;
  const wearOf = (x: number, z: number) => o.wear.sample(x, z);
  const path = createLayer(o.pathMap, 'max', true, o, (x, z) => {
    const t = (wearOf(x, z) - WEAR.PATH.LO) / (WEAR.PATH.HI - WEAR.PATH.LO);
    return 255 * WEAR.PATH.MAX * smoothstep01(t);
  });
  const ao = createLayer(o.aoMap, 'min', false, o);
  const exclusion = o.exclusionMap
    ? createLayer(o.exclusionMap, 'min', false, o, (x, z) => {
        const ragged = (hashNoise(x, z) - 0.5) * 2 * WEAR.GRASS.NOISE;
        const t = (wearOf(x, z) + ragged - WEAR.GRASS.LO) / (WEAR.GRASS.HI - WEAR.GRASS.LO);
        return 255 * (1 - smoothstep01(t));
      })
    : null;
  const layers = [path, ao, exclusion].filter((layer): layer is Layer => layer !== null);
  let sinceCompact = Number.POSITIVE_INFINITY;
  let compactPending = false;

  /** Compose and upload up to `maxTiles` queued tiles, merging neighbours in a row into one upload. */
  const uploadTiles = (layer: Layer, maxTiles: number) => {
    const tiles = [...layer.dirtyTiles].sort((a, b) => a - b).slice(0, maxTiles);
    const runs: GridDirtyRegion[] = [];
    let previous = -2;
    for (const tile of tiles) {
      layer.dirtyTiles.delete(tile);
      const region = tileRegion(layer, tile);
      if (region.iMax < region.iMin || region.jMax < region.jMin) continue;
      const last = runs[runs.length - 1];
      if (last && tile === previous + 1 && tile % layer.tilesAcross !== 0) {
        runs[runs.length - 1] = { ...last, iMax: region.iMax };
      } else {
        runs.push(region);
      }
      previous = tile;
    }
    for (const region of runs) {
      compose(layer, region);
      uploadDataTextureRegion(o.renderer, layer.texture, region, 1);
    }
    if (runs.length > 0 && layer === exclusion) compactPending = true;
  };

  const stampAo = (b: Footprint) =>
    stampLayer(ao, b, {
      core: 0,
      fade: Math.max(0.1, getLiveTerrainAoBakeSettings().radiusM),
      strength: 0,
    });

  return {
    stampBuilding: (b) => {
      stampLayer(path, b, {
        core: TERRAIN.YARD.MARGIN_M,
        fade: TERRAIN.YARD.FADE_M,
        strength: TERRAIN.YARD.STRENGTH * 255,
      });
      stampAo(b);
      if (exclusion) {
        stampLayer(exclusion, b, {
          core: TERRAIN.GRASS_PAD_M,
          fade: TERRAIN.GRASS_FADE_M,
          strength: 0,
        });
      }
    },
    stampField: (field) => {
      if (exclusion) {
        stampLayer(exclusion, field, { core: 0.3, fade: TERRAIN.GRASS_FADE_M, strength: 0 });
      }
    },
    applyWear: (rect) => {
      for (const layer of [path, exclusion]) {
        if (!layer) continue;
        const iMin = Math.max(layer.i0, Math.floor(toTexel(layer, rect.x0)));
        const iMax = Math.min(
          layer.i0 + layer.size - 1,
          layer.texSize - 1,
          Math.ceil(toTexel(layer, rect.x1)),
        );
        const jMin = Math.max(layer.j0, Math.floor(toTexel(layer, rect.z0)));
        const jMax = Math.min(
          layer.j0 + layer.size - 1,
          layer.texSize - 1,
          Math.ceil(toTexel(layer, rect.z1)),
        );
        if (iMax >= iMin && jMax >= jMin) markDirty(layer, { iMin, iMax, jMin, jMax });
      }
    },
    commitFull: () => {
      for (const layer of layers) {
        if (layer.dirtyTiles.size === 0) continue;
        for (const tile of layer.dirtyTiles) {
          const region = tileRegion(layer, tile);
          if (region.iMax >= region.iMin && region.jMax >= region.jMin) compose(layer, region);
        }
        layer.texture.needsUpdate = true;
        layer.dirtyTiles.clear();
        layer.sinceUpload = 0;
      }
    },
    flush: (dt) => {
      sinceCompact += dt;
      for (const layer of layers) {
        if (layer.dirtyTiles.size === 0) continue;
        layer.sinceUpload += dt;
        // A sweep starts at most once per UPLOAD_S, then spreads its tiles over the next frames.
        if (!layer.sweeping && layer.sinceUpload < TERRAIN.UPLOAD_S) continue;
        uploadTiles(layer, TILES_PER_FRAME);
        layer.sweeping = layer.dirtyTiles.size > 0;
        if (!layer.sweeping) layer.sinceUpload = 0;
      }
      if (compactPending && sinceCompact >= TERRAIN.COMPACT_S) {
        o.requestGrassCompact?.();
        compactPending = false;
        sinceCompact = 0;
      }
    },
    reapplyAo: (buildings) => {
      // The bake rewrote the whole texture: take it as the new base, then stamp every building again
      // (the contact-shade radius may have changed too).
      snapshotBase(ao);
      ao.stamped.fill(255);
      for (const b of buildings) stampAo(b);
      uploadTiles(ao, Number.POSITIVE_INFINITY);
      ao.sweeping = false;
      ao.sinceUpload = 0;
    },
  };
}
