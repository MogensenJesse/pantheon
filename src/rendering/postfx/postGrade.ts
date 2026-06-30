// @ts-nocheck — TSL node parameter typings incomplete in r184
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
    uLutEnabled: uniform(G.lut.enabled && G.lut.path ? 1 : 0),
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

/** 3D LUT strip sample with half-pixel edge correction (matches three.js Lut3DNode). */
function sampleLutStrip2D(tex, rgb, lutSize) {
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

  const uvForSlice = (sliceIndex) => {
    const x = uvw.r.mul(sizeMinusOne).add(sliceIndex.mul(size)).add(0.5).div(size.mul(size));
    const y = uvw.g.mul(sizeMinusOne).add(0.5).div(size);
    return vec2(x, y);
  };

  const col0 = tex.sample(uvForSlice(slice0)).rgb;
  const col1 = tex.sample(uvForSlice(slice1)).rgb;
  return mix(col0, col1, interp);
}

function applyProceduralGrade(color, uniforms: PostGradeUniforms) {
  const { uGradeContrast, uGradeSaturation, uGradeLift, uGradeWarmth, uGradeWarmthTint } = uniforms;
  const base = clamp(color, 0, 1);
  const contrasted = base.sub(0.5).mul(uGradeContrast).add(0.5);
  const luma = luminance(contrasted);
  const saturated = mix(vec3(luma, luma, luma), contrasted, uGradeSaturation);
  const lifted = saturated.add(vec3(uGradeLift.r, uGradeLift.g, uGradeLift.b));
  const warmed = mix(lifted, lifted.mul(vec3(uGradeWarmthTint.r, uGradeWarmthTint.g, uGradeWarmthTint.b)), uGradeWarmth);
  return clamp(warmed, 0, 1);
}

/** Procedural saturation/contrast/lift/warmth on display-referred color — after renderOutput. */
export function applyProceduralPostGrade(color, uniforms: PostGradeUniforms) {
  const graded = applyProceduralGrade(color, uniforms);
  return mix(color, graded, uniforms.uGradeEnabled);
}

/**
 * Display-referred creative LUT — runs after renderOutput.
 * Delta-blend strength: base + (lut(base) - base) * strength.
 */
export function applyLutGrade(displayRgb, uniforms: PostGradeUniforms) {
  const lutColor = sampleLutStrip2D(uniforms.lutTextureNode, displayRgb, uniforms.uLutSize);
  const strength = uniforms.uLutEnabled.mul(uniforms.uLutStrength).mul(uniforms.uGradeEnabled);
  const delta = lutColor.sub(displayRgb);
  return displayRgb.add(delta.mul(strength));
}
