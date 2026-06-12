// src/world/terrain/loadTerrainTextures.ts
import {
  Color,
  DataTexture,
  DataUtils,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { displacementCandidateUrls, fetchGltfPackUrls } from './loadTerrainGltfPack';
import { packArmToOrm, packRoughMrToOrm } from './packOrmTexture';
import { buildTerrainBiomeAtlases, type TerrainBiomeAtlases } from './terrainMapAtlas';
import {
  TERRAIN_SKIP_VERTEX_DISP_BIOMES,
  TERRAIN_SNOW_TEXTURE,
  TERRAIN_TEXTURE_BIOMES,
  type TerrainGltfFolder,
} from './terrainTextureManifest';

export type { TerrainBiomeAtlases };
export { initTerrainAtlases } from './terrainMapAtlas';

/** ORM packed texture: R = roughness, G = AO, B = metalness. */
export interface TerrainBiomeMaps {
  color: Texture;
  normal: Texture;
  orm: Texture;
  spec: Texture;
  displacement: Texture;
}

export interface TerrainTextureSet {
  /** Color / normal / ORM / spec / detail displacement atlases (7 biomes in a 3×3 grid). */
  atlases: TerrainBiomeAtlases;
  /** Filtered vertex displacement atlas (alias of atlases.detailDisplacement). */
  detailDisplacement: Texture;
  /** True when at least one biome loaded a real displacement map. */
  hasDisplacementMaps: boolean;
  dispose: () => void;
}

const FALLBACK_COLORS: Record<TerrainGltfFolder, number> = {
  shore: 0x8a9a5b,
  forest: 0x2d7020,
  hills: 0x8c6c35,
  mountain: 0xa09080,
  path: 0x8a7658,
  meadow: 0x6a9a4b,
  snow: 0xe8eef5,
};

function configureColorTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}

function configureDataTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
}

function createFallbackColor(hex: number): DataTexture {
  const color = new Color(hex);
  const data = new Uint8Array([
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    255,
  ]);
  const tex = new DataTexture(data, 1, 1);
  configureColorTexture(tex);
  return tex;
}

function createFallbackNormal(): DataTexture {
  const data = new Uint8Array([128, 128, 255, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

function createFallbackOrm(): DataTexture {
  const data = new Uint8Array([128, 255, 0, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

function createFallbackSpec(): DataTexture {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

function createFallbackDisplacement(): DataTexture {
  // Black — unipolar disp.r * scale = 0 when no height map is loaded
  const data = new Uint8Array([0, 0, 0, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

async function loadDisplacementTexture(url: string): Promise<{ texture: Texture | null; usedFallback: boolean }> {
  try {
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    let texture: Texture;
    if (ext === 'exr') {
      const loader = new EXRLoader();
      texture = await loader.loadAsync(url);
    } else {
      const loader = new TextureLoader();
      texture = await loader.loadAsync(url);
    }
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = NoColorSpace;
    texture.needsUpdate = true;
    return { texture, usedFallback: false };
  } catch {
    return { texture: null, usedFallback: true };
  }
}

type DisplacementPixelData =
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Float32Array;

function readDisplacementHeight(
  data: DisplacementPixelData,
  pixelIndex: number,
  channels: number,
): number {
  const i = pixelIndex * channels;
  if (data instanceof Float32Array) return data[i] ?? 0;
  if (data instanceof Uint16Array) return DataUtils.fromHalfFloat(data[i] ?? 0);
  return (data[i] ?? 128) / 255;
}

/** Decode EXR/JPG/PNG displacement, re-center around 0.5 neutral, emit RGBA8 DataTexture. */
function normalizeDisplacementTexture(source: Texture): DataTexture {
  const img = source.image as
    | HTMLImageElement
    | { width?: number; height?: number; data?: DisplacementPixelData }
    | undefined;

  let width = 1;
  let height = 1;
  let heights: Float32Array;
  let isFloatSource = false;

  if (img instanceof HTMLImageElement) {
    width = img.naturalWidth || img.width || 1;
    height = img.naturalHeight || img.height || 1;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      source.dispose();
      return createFallbackDisplacement();
    }
    ctx.drawImage(img, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const pixelCount = width * height;
    heights = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      heights[i] = rgba[i * 4] / 255;
    }
  } else if (img?.data && img.width && img.height) {
    width = img.width;
    height = img.height;
    const pixelCount = width * height;
    const channels = Math.max(1, Math.floor(img.data.length / pixelCount));
    isFloatSource = img.data instanceof Float32Array || img.data instanceof Uint16Array;
    heights = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      heights[i] = readDisplacementHeight(img.data, i, channels);
    }
  } else {
    source.dispose();
    return createFallbackDisplacement();
  }

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const h = Math.max(0, Math.min(1, heights[i]));
    heights[i] = h;
    sum += h;
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  const mean = sum / heights.length;
  const range = max - min;
  const isJpegSource = img instanceof HTMLImageElement;

  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < heights.length; i++) {
    let centered: number;
    if (isFloatSource) {
      // Poly Haven EXR disp is already 0–1 with ~0.5 flat — preserve proportions, recenter only if drifted.
      centered = heights[i];
      if (Math.abs(mean - 0.5) > 0.02) {
        centered = heights[i] - mean + 0.5;
      }
    } else if (isJpegSource && range >= 0.05) {
      // JPEG pass-through — match D:\three TextureLoader (raw 8-bit, no recenter).
      centered = heights[i];
    } else if (range < 0.05) {
      // Flat 8-bit fallback — stretch whatever contrast exists.
      const stretched = (heights[i] - min) / Math.max(range, 1e-6);
      centered = stretched - (mean - min) / Math.max(range, 1e-6) + 0.5;
    } else {
      centered = heights[i];
      if (Math.abs(mean - 0.5) > 0.02) {
        centered = heights[i] - mean + 0.5;
      }
    }
    const b = Math.round(Math.max(0, Math.min(1, centered)) * 255);
    const p = i * 4;
    out[p] = b;
    out[p + 1] = b;
    out[p + 2] = b;
    out[p + 3] = 255;
  }

  source.dispose();
  const normalized = new DataTexture(out, width, height);
  configureDataTexture(normalized);
  return normalized;
}

async function loadTexture(
  loader: TextureLoader,
  url: string,
  kind: 'color' | 'data',
): Promise<{ texture: Texture | null; usedFallback: boolean }> {
  try {
    const texture = await loader.loadAsync(url);
    if (kind === 'color') configureColorTexture(texture);
    else configureDataTexture(texture);
    return { texture, usedFallback: false };
  } catch {
    return { texture: null, usedFallback: true };
  }
}

async function loadBiomeMapsFromGltfPack(
  loader: TextureLoader,
  folder: TerrainGltfFolder,
): Promise<{ maps: TerrainBiomeMaps; hasRealDisplacement: boolean }> {
  const pack = await fetchGltfPackUrls(folder);
  const fallbackHex = FALLBACK_COLORS[folder];

  if (!pack) {
    return {
      maps: {
        color: createFallbackColor(fallbackHex),
        normal: createFallbackNormal(),
        orm: createFallbackOrm(),
        spec: createFallbackSpec(),
        displacement: createFallbackDisplacement(),
      },
      hasRealDisplacement: false,
    };
  }

  const loads = [
    loadTexture(loader, pack.colorUrl, 'color'),
    loadTexture(loader, pack.normalUrl, 'data'),
    loadTexture(loader, pack.mrUrl, 'data'),
  ];
  if (pack.specUrl) {
    loads.push(loadTexture(loader, pack.specUrl, 'data'));
  }

  const results = await Promise.all(loads);
  const [colorEntry, normalEntry, mrEntry] = results;
  const specEntry = pack.specUrl ? results[3] : null;

  const color = colorEntry.usedFallback || !colorEntry.texture
    ? createFallbackColor(fallbackHex)
    : colorEntry.texture;
  const normal = normalEntry.usedFallback || !normalEntry.texture
    ? createFallbackNormal()
    : normalEntry.texture;

  let orm: Texture;
  if (mrEntry.usedFallback || !mrEntry.texture) {
    orm = createFallbackOrm();
  } else {
    orm =
      pack.mrKind === 'arm'
        ? packArmToOrm(mrEntry.texture)
        : packRoughMrToOrm(mrEntry.texture);
    configureDataTexture(orm);
  }

  let spec: Texture = createFallbackSpec();
  if (specEntry && !specEntry.usedFallback && specEntry.texture) {
    spec = specEntry.texture;
  }

  let displacement: Texture = createFallbackDisplacement();
  let hasRealDisplacement = false;
  if (!TERRAIN_SKIP_VERTEX_DISP_BIOMES.includes(folder)) {
    const dispCandidates = displacementCandidateUrls(folder, pack.colorUrl);
    for (const candidate of dispCandidates) {
      const dispEntry = await loadDisplacementTexture(candidate);
      if (dispEntry.usedFallback || !dispEntry.texture) continue;

      const ext = candidate.split('.').pop()?.toLowerCase() ?? '';
      // EXR needs decode/recenter; JPG/PNG pack via drawImage like color (no canvas round-trip).
      displacement =
        ext === 'exr'
          ? normalizeDisplacementTexture(dispEntry.texture)
          : dispEntry.texture;
      hasRealDisplacement = true;
      break;
    }
  }

  return {
    maps: { color, normal, orm, spec, displacement },
    hasRealDisplacement,
  };
}

export async function loadTerrainTextures(): Promise<TerrainTextureSet> {
  const loader = new TextureLoader();
  const biomeFolders = [...TERRAIN_TEXTURE_BIOMES, TERRAIN_SNOW_TEXTURE] as TerrainGltfFolder[];

  const entries = await Promise.all(
    biomeFolders.map(async (folder) => {
      const result = await loadBiomeMapsFromGltfPack(loader, folder);
      return [folder, result] as const;
    }),
  );

  const maps = entries.map(([, r]) => r.maps);
  const hasDisplacementMaps = entries.some(([, r]) => r.hasRealDisplacement);
  const layerSets = {
    color: maps.map((m) => m.color),
    normal: maps.map((m) => m.normal),
    orm: maps.map((m) => m.orm),
    spec: maps.map((m) => m.spec),
    displacement: maps.map((m) => m.displacement),
  };

  const atlases = buildTerrainBiomeAtlases(layerSets);

  for (const m of maps) {
    m.displacement.dispose();
  }

  return {
    atlases,
    detailDisplacement: atlases.detailDisplacement,
    hasDisplacementMaps,
    dispose() {
      atlases.color.dispose();
      atlases.normal.dispose();
      atlases.orm.dispose();
      atlases.spec.dispose();
      atlases.detailDisplacement.dispose();
    },
  };
}
