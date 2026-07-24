// src/world/terrain/loaders/loadBakedTerrainAtlases.ts — play-mode KTX2 / R8 atlas load
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
} from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { createKtx2Loader } from '../../../assets/createKtx2Loader';
import {
  TERRAIN_ATLAS_COLS,
  TERRAIN_ATLAS_DISP_TILE_PX,
  TERRAIN_ATLAS_GUTTER_PX,
} from '../atlas/atlasConstants';
import { terrainBakedAtlasUrl } from '../atlas/bakedAtlasPaths';
import type { TerrainBiomeAtlases } from '../atlas/terrainMapAtlas';
import { TerrainPackLoadError } from './terrainLoadErrors';
import type { TerrainTextureSet } from './terrainTextureTypes';

function configureSurfaceAtlas(tex: Texture, kind: 'color' | 'data'): void {
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = kind === 'color' ? SRGBColorSpace : NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
}

function configureDispAtlas(tex: DataTexture): void {
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
}

function expectedDispAtlasSize(): number {
  const cell = TERRAIN_ATLAS_DISP_TILE_PX + TERRAIN_ATLAS_GUTTER_PX * 2;
  return cell * TERRAIN_ATLAS_COLS;
}

async function loadDetailDisplacementR8(url: string): Promise<DataTexture> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new TerrainPackLoadError(
      `Terrain displacement atlas missing: ${url} (${res.status} ${res.statusText})`,
    );
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const size = expectedDispAtlasSize();
  const expected = size * size;
  if (buf.byteLength !== expected) {
    throw new TerrainPackLoadError(
      `Terrain displacement atlas size mismatch: ${url} has ${buf.byteLength} bytes, expected ${expected} (${size}×${size} R8)`,
    );
  }
  const tex = new DataTexture(buf, size, size, RedFormat, UnsignedByteType);
  configureDispAtlas(tex);
  return tex;
}

/**
 * Load offline-baked play atlases (KTX2 surface + raw R8 displacement).
 * Requires `await renderer.init()` and `npm run bake:terrain-atlases`.
 */
export async function loadBakedTerrainAtlases(
  renderer: WebGPURenderer,
): Promise<TerrainTextureSet> {
  const ktx2 = createKtx2Loader(renderer);
  try {
    const [color, normal, orm, spec, detailDisplacement] = await Promise.all([
      ktx2.loadAsync(terrainBakedAtlasUrl('color')),
      ktx2.loadAsync(terrainBakedAtlasUrl('normal')),
      ktx2.loadAsync(terrainBakedAtlasUrl('orm')),
      ktx2.loadAsync(terrainBakedAtlasUrl('spec')),
      loadDetailDisplacementR8(terrainBakedAtlasUrl('detailDisplacement')),
    ]);

    configureSurfaceAtlas(color, 'color');
    configureSurfaceAtlas(normal, 'data');
    configureSurfaceAtlas(orm, 'data');
    configureSurfaceAtlas(spec, 'data');

    const atlases: TerrainBiomeAtlases = {
      color,
      normal,
      orm,
      spec,
      detailDisplacement,
    };

    return {
      atlases,
      detailDisplacement,
      hasDisplacementMaps: true,
      dispose() {
        atlases.color.dispose();
        atlases.normal.dispose();
        atlases.orm.dispose();
        atlases.spec.dispose();
        atlases.detailDisplacement.dispose();
      },
    };
  } catch (cause) {
    if (cause instanceof TerrainPackLoadError) throw cause;
    throw new TerrainPackLoadError(
      'Failed to load baked terrain atlases — run `npm run bake:terrain-atlases`',
      { cause },
    );
  }
}
