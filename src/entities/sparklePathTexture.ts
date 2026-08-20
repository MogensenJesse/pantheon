// src/entities/sparklePathTexture.ts — 1×N float RGBA path / orb-center DataTexture
import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  type MagnificationTextureFilter,
  type MinificationTextureFilter,
  NoColorSpace,
  RGBAFormat,
} from 'three';

/** Horizontal float strip; filter is Nearest (orb slots) or Linear (path samples). */
export function createSparklePathTexture(
  width: number,
  filter: MagnificationTextureFilter,
): DataTexture {
  const w = Math.max(2, width);
  const tex = new DataTexture(new Float32Array(w * 4), w, 1, RGBAFormat, FloatType);
  tex.minFilter = filter as MinificationTextureFilter;
  tex.magFilter = filter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
