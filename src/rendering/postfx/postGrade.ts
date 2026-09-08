// src/rendering/postfx/postGrade.ts — display-referred procedural grade + LUT after renderOutput
import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
} from 'three';
import {
  clamp,
  float,
  floor,
  luminance,
  min,
  mix,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

export interface PostGradeRegionUniforms {
  saturation: ReturnType<typeof uniform>;
  contrast: ReturnType<typeof uniform>;
  lift: ReturnType<typeof uniform>;
}

export interface PostGradeUniforms {
  uGradeEnabled: ReturnType<typeof uniform>;
  shadows: PostGradeRegionUniforms;
  midtones: PostGradeRegionUniforms;
  highlights: PostGradeRegionUniforms;
  uGradeWarmth: ReturnType<typeof uniform>;
  uGradeWarmthTint: ReturnType<typeof uniform>;
  uLutEnabled: ReturnType<typeof uniform>;
  uLutStrength: ReturnType<typeof uniform>;
  uLutSize: ReturnType<typeof uniform>;
  /** Runtime-swappable LUT strip — TextureNode; update via `.value`. */
  lutTextureNode: ReturnType<typeof texture>;
}

const G = VISUAL.postfx.grade;

let placeholderLutTexture: DataTexture | null = null;

function getPlaceholderLutTexture(): DataTexture {
  if (!placeholderLutTexture) {
    placeholderLutTexture = new DataTexture(
      new Uint8Array([128, 128, 128, 255]),
      1,
      1,
      RGBAFormat,
      UnsignedByteType,
    );
    placeholderLutTexture.wrapS = ClampToEdgeWrapping;
    placeholderLutTexture.wrapT = ClampToEdgeWrapping;
    placeholderLutTexture.minFilter = LinearFilter;
    placeholderLutTexture.magFilter = LinearFilter;
    placeholderLutTexture.generateMipmaps = false;
    placeholderLutTexture.colorSpace = SRGBColorSpace;
    placeholderLutTexture.needsUpdate = true;
  }
  return placeholderLutTexture;
}

function regionUniforms(region: {
  saturation: number;
  contrast: number;
  lift: { r: number; g: number; b: number };
}): PostGradeRegionUniforms {
  return {
    saturation: uniform(region.saturation),
    contrast: uniform(region.contrast),
    lift: uniform(new Color(region.lift.r, region.lift.g, region.lift.b)),
  };
}

export function createPostGradeUniforms(): PostGradeUniforms {
  const noon = G.stops.noon;
  const lutTextureNode = texture(getPlaceholderLutTexture());
  return {
    uGradeEnabled: uniform(G.enabled ? 1 : 0),
    shadows: regionUniforms(noon.shadows),
    midtones: regionUniforms(noon.midtones),
    highlights: regionUniforms(noon.highlights),
    uGradeWarmth: uniform(noon.warmth),
    uGradeWarmthTint: uniform(new Color(noon.warmthTint)),
    uLutEnabled: uniform(noon.lut.enabled && noon.lut.path ? 1 : 0),
    uLutStrength: uniform(noon.lut.strength),
    uLutSize: uniform(noon.lut.size),
    lutTextureNode,
  };
}

/** Swap the LUT strip texture at runtime (updates TextureNode.value). */
export function setPostGradeLutTexture(
  uniforms: PostGradeUniforms,
  lutTexture: Texture | null,
): void {
  const next = lutTexture ?? getPlaceholderLutTexture();
  next.needsUpdate = true;
  uniforms.lutTextureNode.value = next;
}

/** 3D LUT strip sample with half-pixel edge correction (matches three.js Lut3DNode). */
function sampleLutStrip2D(tex: any, rgb: any, lutSize: any) {
  const size = float(lutSize);
  const sizeMinusOne = size.sub(1);
  const pixelWidth = float(1).div(size);
  const halfPixelWidth = float(0.5).div(size);
  const c = clamp(rgb, 0, 1);
  const uvw = vec3(halfPixelWidth).add(c.mul(float(1).sub(pixelWidth)));
  const blueSlice = uvw.b.mul(sizeMinusOne);
  const slice0 = floor(blueSlice);
  const slice1 = min(slice0.add(1), sizeMinusOne);
  const interp = blueSlice.sub(slice0);

  const uvForSlice = (sliceIndex: any) => {
    const x = uvw.r.mul(sizeMinusOne).add(sliceIndex.mul(size)).add(0.5).div(size.mul(size));
    const y = uvw.g.mul(sizeMinusOne).add(0.5).div(size);
    return vec2(x, y);
  };

  const col0 = tex.sample(uvForSlice(slice0)).rgb;
  const col1 = tex.sample(uvForSlice(slice1)).rgb;
  return mix(col0, col1, interp);
}

function applyRegionGrade(rgb: any, region: PostGradeRegionUniforms) {
  const contrasted = rgb
    .sub(0.5)
    .mul(region.contrast as any)
    .add(0.5);
  const luma = luminance(contrasted);
  const saturated = mix(vec3(luma, luma, luma), contrasted, region.saturation as any);
  return saturated.add(region.lift as any);
}

/**
 * Soft shadows / midtones / highlights masks (pivots ~0.15 / 0.5 / 0.85).
 * Apply sat→contrast→lift per region, then warmth.
 */
function applyProceduralGrade(color: any, uniforms: PostGradeUniforms) {
  const base = clamp(color, 0, 1);
  const luma = luminance(base);
  const shadowW = float(1).sub(smoothstep(float(0.05), float(0.35), luma));
  const highlightW = smoothstep(float(0.65), float(0.95), luma);
  const midW = float(1).sub(shadowW).sub(highlightW).saturate();
  const sum = shadowW.add(midW).add(highlightW).max(float(1e-4));
  const sw = shadowW.div(sum);
  const mw = midW.div(sum);
  const hw = highlightW.div(sum);

  const graded = applyRegionGrade(base, uniforms.shadows)
    .mul(sw)
    .add(applyRegionGrade(base, uniforms.midtones).mul(mw))
    .add(applyRegionGrade(base, uniforms.highlights).mul(hw));

  const warmed = mix(graded, graded.mul(uniforms.uGradeWarmthTint as any), uniforms.uGradeWarmth as any);
  return clamp(warmed, 0, 1);
}

/** Procedural 3-way grade + warmth on display-referred color — after renderOutput. */
export function applyProceduralPostGrade(color: any, uniforms: PostGradeUniforms) {
  const graded = applyProceduralGrade(color, uniforms);
  return mix(color, graded, uniforms.uGradeEnabled as any);
}

/**
 * Display-referred creative LUT — runs after renderOutput.
 * Delta-blend strength: base + (lut(base) - base) * strength.
 * Enable is independent of procedural `uGradeEnabled`.
 */
export function applyLutGrade(displayRgb: any, uniforms: PostGradeUniforms) {
  const lutColor = sampleLutStrip2D(uniforms.lutTextureNode, displayRgb, uniforms.uLutSize);
  const strength = (uniforms.uLutEnabled as any).mul(uniforms.uLutStrength);
  const delta = lutColor.sub(displayRgb);
  return displayRgb.add(delta.mul(strength));
}
