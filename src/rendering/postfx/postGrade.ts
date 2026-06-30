// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/postfx/postGrade.ts — display-referred procedural grade + optional LUT strip
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
import { clamp, float, floor, luminance, min, mix, texture, uniform, vec2, vec3 } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

export interface PostGradeUniforms {
  uGradeEnabled: ReturnType<typeof uniform>;
  uGradeSaturation: ReturnType<typeof uniform>;
  uGradeContrast: ReturnType<typeof uniform>;
  uGradeLift: ReturnType<typeof uniform>;
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

export function createPostGradeUniforms(): PostGradeUniforms {
  const lutTextureNode = texture(getPlaceholderLutTexture());
  return {
    uGradeEnabled: uniform(G.enabled ? 1 : 0),
    uGradeSaturation: uniform(G.saturation),
    uGradeContrast: uniform(G.contrast),
    uGradeLift: uniform(new Color(G.lift.r, G.lift.g, G.lift.b)),
    uGradeWarmth: uniform(0),
    uGradeWarmthTint: uniform(new Color(G.warmthTint)),
    uLutEnabled: uniform(0),
    uLutStrength: uniform(G.lut.strength),
    uLutSize: uniform(G.lut.size),
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

function sampleLutStrip2D(tex, rgb, lutSize) {
  const size = float(lutSize);
  const sizeMinusOne = size.sub(1);
  const c = clamp(rgb, 0, 1);
  const blueSlice = c.b.mul(sizeMinusOne);
  const slice0 = floor(blueSlice);
  const slice1 = min(slice0.add(1), sizeMinusOne);
  const interp = blueSlice.sub(slice0);

  const uvForSlice = (sliceIndex) => {
    const x = c.r.mul(sizeMinusOne).add(sliceIndex.mul(size)).add(0.5).div(size.mul(size));
    const y = c.g.mul(sizeMinusOne).add(0.5).div(size);
    return vec2(x, y);
  };

  const col0 = tex.sample(uvForSlice(slice0)).rgb;
  const col1 = tex.sample(uvForSlice(slice1)).rgb;
  return mix(col0, col1, interp);
}

function applyProceduralGrade(color, uniforms: PostGradeUniforms) {
  const { uGradeContrast, uGradeSaturation, uGradeLift, uGradeWarmth, uGradeWarmthTint } = uniforms;
  const contrasted = color.sub(0.5).mul(uGradeContrast).add(0.5);
  const luma = luminance(contrasted);
  const saturated = mix(vec3(luma, luma, luma), contrasted, uGradeSaturation);
  const lifted = saturated.add(vec3(uGradeLift.r, uGradeLift.g, uGradeLift.b));
  const warmed = mix(lifted, lifted.mul(vec3(uGradeWarmthTint.r, uGradeWarmthTint.g, uGradeWarmthTint.b)), uGradeWarmth);
  return warmed;
}

/** Grade after AgX tone map; bypass when uGradeEnabled is 0. */
export function applyPostGrade(color, uniforms: PostGradeUniforms) {
  const graded = applyProceduralGrade(color, uniforms);
  const lutColor = sampleLutStrip2D(uniforms.lutTextureNode, graded, uniforms.uLutSize);
  const withLut = mix(graded, lutColor, uniforms.uLutEnabled.mul(uniforms.uLutStrength));
  return mix(color, withLut, uniforms.uGradeEnabled);
}
