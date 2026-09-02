// src/world/terrain/loaders/loadBakedTerrainAtlases.ts — play-mode KTX2 atlas load
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { createKtx2Loader } from '../../../assets/createKtx2Loader';
import { terrainBakedAtlasUrl } from '../atlas/bakedAtlasPaths';
import { createStubAoAtlas, type TerrainBiomeAtlases } from '../atlas/terrainMapAtlas';
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

export interface LoadBakedTerrainAtlasesOptions {
  /** Skip `ao.ktx2` — 1×1 stub (editor simpleShading). */
  colorOnly?: boolean;
}

/**
 * Load offline-baked play atlases (KTX2 color + AO).
 * Requires `await renderer.init()` and `npm run bake:terrain-atlases`.
 */
export async function loadBakedTerrainAtlases(
  renderer: WebGPURenderer,
  options: LoadBakedTerrainAtlasesOptions = {},
): Promise<TerrainTextureSet> {
  const ktx2 = createKtx2Loader(renderer);
  try {
    const color = await ktx2.loadAsync(terrainBakedAtlasUrl('color'));
    configureSurfaceAtlas(color, 'color');

    let ao: Texture;
    if (options.colorOnly) {
      ao = createStubAoAtlas();
    } else {
      ao = await ktx2.loadAsync(terrainBakedAtlasUrl('ao'));
      configureSurfaceAtlas(ao, 'data');
    }

    const atlases: TerrainBiomeAtlases = { color, ao };

    return {
      atlases,
      dispose() {
        atlases.color.dispose();
        atlases.ao.dispose();
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
