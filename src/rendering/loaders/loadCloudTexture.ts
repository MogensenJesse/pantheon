// src/rendering/loaders/loadCloudTexture.ts — mrdoob-style soft cloud puff sprite (PNG)
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';

const CLOUD_TEXTURE_PATH = 'models/sky/cloud_puff.png';

export async function loadCloudTexture(): Promise<Texture> {
  const loader = new TextureLoader();
  const tex = await loader.loadAsync(CLOUD_TEXTURE_PATH);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
