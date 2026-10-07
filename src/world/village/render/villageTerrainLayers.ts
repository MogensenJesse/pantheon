// src/world/village/render/villageTerrainLayers.ts — building footprints in the terrain's grass, contact-shade and path layers
import type { DataTexture } from 'three';
import { VILLAGE } from '../../../config/village';
import type { GridDirtyRegion } from '../../../map/authoring/gridDirtyRegion';
import { type GridTextureGpu, uploadDataTextureRegion } from '../../../map/MapGrids';
import { getLiveTerrainAoBakeSettings } from '../../mapProps/data/propContactAoDevState';
import { WORLD } from '../../WorldConfig';
import type { Building } from '../sim/villageTypes';

export interface VillageTerrainLayersOptions {
  renderer: GridTextureGpu;
  pathMap: DataTexture;
  aoMap: DataTexture;
  /** Null when the map has no grass. */
  exclusionMap: DataTexture | null;
  requestGrassCompact: (() => void) | null;
  centerX: number;
  centerZ: number;
  radiusM: number;
}

export interface VillageTerrainLayers {
  /** Mark a building's footprint: grass cleared, ground shaded around it, a worn yard. */
  stampBuilding: (building: Building) => void;
  /** Founding pass, before the textures are first drawn: write everything with plain full uploads. */
  commitFull: () => void;
  /** Upload pending changes, at most once per interval per layer. Call once per frame. */
  flush: (dt: number) => void;
  /** Re-apply the village over a layer something else just rewrote (DEV re-bakes). */
  reapply: () => void;
}

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
  dirty: GridDirtyRegion | null;
  sinceUpload: number;
}

const smoothstep01 = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

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
    dirty: null,
    sinceUpload: Number.POSITIVE_INFINITY,
  } satisfies Layer as Layer;
  const half = o.radiusM + VILLAGE.TERRAIN.MARGIN_M;
  layer.i0 = Math.max(0, Math.floor(toTexel(layer, o.centerX - half)));
  layer.j0 = Math.max(0, Math.floor(toTexel(layer, o.centerZ - half)));
  const i1 = Math.min(texSize - 1, Math.ceil(toTexel(layer, o.centerX + half)));
  const j1 = Math.min(texSize - 1, Math.ceil(toTexel(layer, o.centerZ + half)));
  layer.size = Math.max(i1 - layer.i0, j1 - layer.j0) + 1;
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

function markDirty(layer: Layer, r: GridDirtyRegion): void {
  const d = layer.dirty;
  layer.dirty = d
    ? {
        iMin: Math.min(d.iMin, r.iMin),
        iMax: Math.max(d.iMax, r.iMax),
        jMin: Math.min(d.jMin, r.jMin),
        jMax: Math.max(d.jMax, r.jMax),
      }
    : r;
}

interface Stamp {
  /** Fully affected margin beyond the plinth pad (m). */
  core: number;
  /** Distance over which the effect fades out (m). */
  fade: number;
  /** Strength 0..255 for max layers. */
  strength: number;
}

/** Stamp a smooth rounded rectangle around the building's pad into one layer. */
function stampLayer(layer: Layer, b: Building, s: Stamp): void {
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
      layer.data[j * layer.texSize + i] =
        layer.blend === 'min' ? Math.min(base, stamped) : Math.max(base, stamped);
    }
  }
}

export function createVillageTerrainLayers(o: VillageTerrainLayersOptions): VillageTerrainLayers {
  const { TERRAIN } = VILLAGE;
  const path = createLayer(o.pathMap, 'max', true, o);
  const ao = createLayer(o.aoMap, 'min', false, o);
  const exclusion = o.exclusionMap ? createLayer(o.exclusionMap, 'min', false, o) : null;
  const layers = [path, ao, exclusion].filter((layer): layer is Layer => layer !== null);
  let sinceCompact = Number.POSITIVE_INFINITY;
  let compactPending = false;

  const upload = (layer: Layer) => {
    const region = layer.dirty;
    if (!region) return;
    compose(layer, region);
    uploadDataTextureRegion(o.renderer, layer.texture, region, 1);
    layer.dirty = null;
    layer.sinceUpload = 0;
    if (layer === exclusion) compactPending = true;
  };

  return {
    stampBuilding: (b) => {
      stampLayer(path, b, {
        core: TERRAIN.YARD.MARGIN_M,
        fade: TERRAIN.YARD.FADE_M,
        strength: TERRAIN.YARD.STRENGTH * 255,
      });
      stampLayer(ao, b, {
        core: 0,
        fade: Math.max(0.1, getLiveTerrainAoBakeSettings().radiusM),
        strength: 0,
      });
      if (exclusion) {
        stampLayer(exclusion, b, {
          core: TERRAIN.GRASS_PAD_M,
          fade: TERRAIN.GRASS_FADE_M,
          strength: 0,
        });
      }
    },
    commitFull: () => {
      for (const layer of layers) {
        if (!layer.dirty) continue;
        compose(layer, layer.dirty);
        layer.texture.needsUpdate = true;
        layer.dirty = null;
        layer.sinceUpload = 0;
      }
    },
    flush: (dt) => {
      sinceCompact += dt;
      for (const layer of layers) {
        if (!layer.dirty) continue;
        layer.sinceUpload += dt;
        if (layer.sinceUpload >= TERRAIN.UPLOAD_S) upload(layer);
      }
      if (compactPending && sinceCompact >= TERRAIN.COMPACT_S) {
        o.requestGrassCompact?.();
        compactPending = false;
        sinceCompact = 0;
      }
    },
    reapply: () => {
      for (const layer of layers) {
        snapshotBase(layer);
        layer.dirty = {
          iMin: layer.i0,
          iMax: Math.min(layer.i0 + layer.size - 1, layer.texSize - 1),
          jMin: layer.j0,
          jMax: Math.min(layer.j0 + layer.size - 1, layer.texSize - 1),
        };
        upload(layer);
      }
    },
  };
}
