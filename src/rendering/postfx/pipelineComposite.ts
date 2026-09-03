// src/rendering/postfx/pipelineComposite.ts — god-rays/bloom composite + grade sharp color
import { agxToneMapping, Fn, renderOutput, screenUV, vec4 } from 'three/tsl';
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

  const buildComposite = (withGodrays: boolean, withBloom: boolean) =>
    Fn(() => {
      const uv = screenUV;

      const baseSample = sceneBeauty.sample(uv);
      let sceneRgb = baseSample.rgb;
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
            bloomSkyAttenuation(
              baseSample.rgb,
              sceneDepthSample,
              bloomControls.bloomSkyMaskUniforms,
            ),
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
