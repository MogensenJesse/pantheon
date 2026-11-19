// src/rendering/postfx/pipelineComposite.ts — god-rays/bloom composite + grade sharp color
import { agxToneMapping, Fn, If, mix, renderOutput, rtt, screenUV, vec3, vec4 } from 'three/tsl';
import { underwaterRippleOffsetTsl } from '../underwater/underwaterRippleTsl';
import { underwaterShaftsTsl } from '../underwater/underwaterShaftsTsl';
import { underwaterVoidFillTsl } from '../underwater/underwaterTsl';
import { underwaterUniforms } from '../underwater/underwaterUniforms';
import { bloomSkyAttenuation } from './bloomSkyMask';
import type { createBloomControls } from './controls/bloomControls';
import type { createGodraysControls } from './controls/godraysControls';
import type { createGradeControls } from './controls/gradeControls';
import { applyLutGrade, applyProceduralPostGrade } from './postGrade';
import type { TslNode } from './tslNode';

type BloomControls = ReturnType<typeof createBloomControls>;
type GodraysControls = ReturnType<typeof createGodraysControls>;
type GradeControls = ReturnType<typeof createGradeControls>;

/** Minimal uniform handle used by the composite (matches `uniform()` from three/tsl). */
type ScalarUniform = ReturnType<typeof import('three/tsl').uniform>;

export interface PipelineCompositeDeps {
  sceneBeauty: TslNode;
  sceneDepth: TslNode;
  bloomControls: BloomControls;
  godraysControls: GodraysControls;
  gradeControls: GradeControls;
  uExposure: ScalarUniform;
}

export function createPipelineComposite(deps: PipelineCompositeDeps) {
  const { sceneBeauty, bloomControls, godraysControls, gradeControls, uExposure } = deps;

  // Light shafts in the water, drawn at a quarter of the screen's width and height: the ray march is costly and the
  // beams are soft. Cheap when idle (above water or sun down): the march sits behind the same uniform branch.
  const underwaterShafts = rtt(
    Fn(() => {
      const out = vec3(0).toVar();
      If(underwaterUniforms.uShaftFade.greaterThan(0.001), () => {
        out.assign(underwaterShaftsTsl(screenUV, deps.sceneDepth));
      });
      return vec4(out, 1);
    })(),
    null,
    null,
    { resolutionScale: 0.25 },
  );

  const buildComposite = (withGodrays: boolean, withBloom: boolean) =>
    Fn(() => {
      // Under the surface the whole view wobbles; a uniform condition, so above water this costs nothing.
      const uv = screenUV.toVar();
      If(underwaterUniforms.uSubmerge.greaterThan(0.001), () => {
        uv.addAssign(underwaterRippleOffsetTsl(screenUV));
      });

      const baseSample = sceneBeauty.sample(uv);
      const sceneVar = baseSample.rgb.toVar();
      // Under water, the void below the horizon past the terrain's edge is water, not sky (the bloom source gets the same
      // fill in createPostFxPipeline, so it does not glow from a sky band that is no longer there).
      const skyMaskRgb = baseSample.rgb.toVar();
      If(underwaterUniforms.uSubmerge.greaterThan(0.001), () => {
        const fill = underwaterVoidFillTsl(uv, deps.sceneDepth);
        sceneVar.assign(mix(sceneVar, fill.color, fill.weight));
        skyMaskRgb.assign(sceneVar);
      });
      // Light shafts in the water: a uniform condition, so above water (or with the sun gone) this costs nothing.
      If(underwaterUniforms.uShaftFade.greaterThan(0.001), () => {
        sceneVar.addAssign(underwaterShafts.sample(uv).rgb);
      });
      let sceneRgb: TslNode = sceneVar;
      if (withGodrays) {
        const shaft = godraysControls.godraysNode.getTextureNode().sample(uv).r;
        sceneRgb = sceneRgb.add(
          godraysControls.uTint.mul(shaft).mul(godraysControls.uGodRaysWeight),
        );
      }
      let bloomed = sceneRgb;
      if (withBloom) {
        const sceneDepthSample = deps.sceneDepth.sample(uv).r;
        const bloomAdd = bloomControls.bloomScene
          .mul(bloomControls.uSceneBloomWeight)
          .mul(
            bloomSkyAttenuation(skyMaskRgb, sceneDepthSample, bloomControls.bloomSkyMaskUniforms),
          );
        bloomed = sceneRgb.add(bloomAdd);
      }
      const toned = agxToneMapping(bloomed, uExposure);

      return vec4(toned as TslNode, 1);
    });

  const compositeByKey = {
    '0_0': buildComposite(false, false)(),
    '0_1': buildComposite(false, true)(),
    '1_0': buildComposite(true, false)(),
    '1_1': buildComposite(true, true)(),
  } as const;
  type CompositeKey = keyof typeof compositeByKey;

  const pickComposite = (withGodrays: boolean, withBloom: boolean): TslNode =>
    compositeByKey[`${withGodrays ? 1 : 0}_${withBloom ? 1 : 0}` as CompositeKey];

  const buildSharpColor = (gradedNode: TslNode) =>
    Fn(() => {
      const display = renderOutput(gradedNode);
      const procedural = applyProceduralPostGrade(display.rgb, gradeControls.gradeUniforms);
      const rgb = applyLutGrade(procedural, gradeControls.gradeUniforms);
      return vec4(rgb, 1);
    })();

  return { pickComposite, buildSharpColor };
}
