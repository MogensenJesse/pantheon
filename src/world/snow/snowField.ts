// @ts-nocheck — TSL node typings are incomplete (same as world/terrain/material/biomeSplatDisplacement.ts)
// src/world/snow/snowField.ts — the tracks field: a toroidal RG16F target (R depression m, G berm m) that brushes are stamped into
//
// Texel (u, v) holds the world point p with fract(p / windowM) = (u, v), so the window follows the orb without copying
// (readers use fract(world / windowM)). A brush is one draw of a fullscreen quad with MAX blending, so repeated stamps at
// the same place never ploughs deeper than the brush depth. `maintain` is the upkeep pass: one multiplicative draw that
// fades the field and clears the texels that entered the window (cpu/snowFieldMath.ts has the maths).
// Modelled on rendering/sunShadow/worldShadowVisibility.ts.
import {
  AddEquation,
  CustomBlending,
  HalfFloatType,
  LinearFilter,
  MaxEquation,
  OneFactor,
  RepeatWrapping,
  RGFormat,
  SrcColorFactor,
  type Texture,
  Vector2,
  Vector4,
  ZeroFactor,
} from 'three';
import { exp, Fn, float, fract, max, smoothstep, step, uniform, uv, vec2, vec4 } from 'three/tsl';
import { NodeMaterial, QuadMesh, RenderTarget, type WebGPURenderer } from 'three/webgpu';
import { brushRects } from './cpu/snowBrushRects';

export interface SnowBrush {
  x: number;
  z: number;
  /** Half-extents (m) along and across the heading. */
  halfA: number;
  halfB: number;
  /** Unit heading in XZ. */
  dirX: number;
  dirZ: number;
  /** Furrow depth and berm height (m). */
  depthM: number;
  bermM: number;
}

export interface SnowField {
  readonly texture: Texture;
  readonly windowM: number;
  readonly res: number;
  /** Queue a brush for the next `flush`; extra brushes past the cap are dropped. */
  queue: (brush: SnowBrush) => void;
  /** Stamp every queued brush; returns how many were drawn. */
  flush: (renderer: WebGPURenderer) => number;
  /**
   * Upkeep: keep `keepDepression` / `keepBerm` (0..1) of the field, and clear the texels whose world point differs between
   * a window centred on `from` and one centred on `to` (world XZ).
   */
  maintain: (
    renderer: WebGPURenderer,
    from: { x: number; z: number },
    to: { x: number; z: number },
    keepDepression: number,
    keepBerm: number,
  ) => void;
  dispose: () => void;
}

/** Brushes drawn per frame; more are dropped (the stride walker treats a longer step as a jump). */
export const MAX_BRUSHES_PER_FRAME = 48;
/** How far a brush reaches, in its longer half-extent: the berm ring is 1.04 and has faded to nothing by 1.8. */
const BRUSH_REACH = 1.8;

export function createSnowField(windowM: number, res: number): SnowField {
  const target = new RenderTarget(res, res, {
    type: HalfFloatType,
    format: RGFormat,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  target.texture.wrapS = RepeatWrapping;
  target.texture.wrapT = RepeatWrapping;
  target.texture.name = 'SnowField';

  const uA = uniform(new Vector4()); // x, z, halfA, halfB
  const uB = uniform(new Vector4()); // dirX, dirZ, depth, berm

  const brush = Fn(() => {
    // wrapped offset of this texel's world point from the brush centre, in metres
    const d = fract(uv().mul(windowM).sub(uA.xy).div(windowM).add(0.5))
      .mul(windowM)
      .sub(windowM / 2);
    const along = d.x.mul(uB.x).add(d.y.mul(uB.y));
    const across = d.y.mul(uB.x).sub(d.x.mul(uB.y));
    const r = vec2(along.div(uA.z), across.div(uA.w)).length();
    // flat floor with a quick shoulder, and a ring of displaced snow just outside it
    const depression = uB.z.mul(float(1).sub(smoothstep(0.42, 1, r)));
    const berm = uB.w.mul(exp(r.sub(1.04).mul(3.4).pow(2).negate()));
    return vec4(depression, berm, 0, 1);
  });

  const material = new NodeMaterial();
  material.name = 'snowFieldBrush';
  material.fragmentNode = brush();
  // max(new, history). The target has no alpha channel, so the alpha factors must not read it (see worldShadowVisibility).
  material.transparent = true;
  material.blending = CustomBlending;
  material.blendEquation = MaxEquation;
  material.blendSrc = OneFactor;
  material.blendDst = OneFactor;
  material.blendEquationAlpha = AddEquation;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = ZeroFactor;
  material.depthTest = false;
  material.depthWrite = false;
  const quad = new QuadMesh(material);
  quad.name = 'Snow field brush';

  const uFrom = uniform(new Vector2());
  const uTo = uniform(new Vector2());
  const uKeep = uniform(new Vector2(1, 1));
  const keep = Fn(() => {
    const t = uv().mul(windowM);
    // the world point this texel stands for with the window centred on c
    const at = (c) =>
      fract(t.sub(c).div(windowM).add(0.5))
        .mul(windowM)
        .sub(windowM / 2)
        .add(c);
    const moved = at(uFrom).sub(at(uTo)).abs();
    const stays = float(1).sub(step(float(0.01), max(moved.x, moved.y)));
    return vec4(uKeep.x.mul(stays), uKeep.y.mul(stays), 1, 1);
  });
  const upkeepMaterial = new NodeMaterial();
  upkeepMaterial.name = 'snowFieldUpkeep';
  upkeepMaterial.fragmentNode = keep();
  // dst * src: the output is a factor per channel (0 clears the texel), history is kept scaled
  upkeepMaterial.transparent = true;
  upkeepMaterial.blending = CustomBlending;
  upkeepMaterial.blendEquation = AddEquation;
  upkeepMaterial.blendSrc = ZeroFactor;
  upkeepMaterial.blendDst = SrcColorFactor;
  upkeepMaterial.blendEquationAlpha = AddEquation;
  upkeepMaterial.blendSrcAlpha = ZeroFactor;
  upkeepMaterial.blendDstAlpha = OneFactor;
  upkeepMaterial.depthTest = false;
  upkeepMaterial.depthWrite = false;
  const upkeepQuad = new QuadMesh(upkeepMaterial);
  upkeepQuad.name = 'Snow field upkeep';

  const pending: SnowBrush[] = [];

  /** Runs `draw` with the field as the render target, then puts the renderer back as it was. */
  const intoField = (renderer: WebGPURenderer, draw: () => void) => {
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    draw();
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
  };

  return {
    texture: target.texture,
    windowM,
    res,
    queue: (b) => {
      if (pending.length < MAX_BRUSHES_PER_FRAME) pending.push(b);
    },
    flush: (renderer) => {
      const n = pending.length;
      if (n === 0) return 0;
      intoField(renderer, () => {
        target.scissorTest = true;
        for (const b of pending) {
          uA.value.set(b.x, b.z, b.halfA, b.halfB);
          uB.value.set(b.dirX, b.dirZ, b.depthM, b.bermM);
          // only the texels the brush reaches (its depression and the berm ring), not the whole window
          for (const [x, y, w, h] of brushRects(
            b.x,
            b.z,
            BRUSH_REACH * Math.max(b.halfA, b.halfB),
            windowM,
            res,
          )) {
            target.scissor.set(x, y, w, h);
            quad.render(renderer);
          }
        }
        target.scissorTest = false;
      });
      pending.length = 0;
      return n;
    },
    maintain: (renderer, from, to, keepDepression, keepBerm) => {
      uFrom.value.set(from.x, from.z);
      uTo.value.set(to.x, to.z);
      uKeep.value.set(keepDepression, keepBerm);
      intoField(renderer, () => upkeepQuad.render(renderer));
    },
    dispose: () => {
      material.dispose();
      upkeepMaterial.dispose();
      target.dispose();
    },
  };
}
