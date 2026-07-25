// src/rendering/postfx/pipelineComposite.ts — god-rays/bloom composite + grade sharp color
import { agxToneMapping, Fn, mix, renderOutput, screenUV, vec4 } from 'three/tsl';
import { bloomSkyAttenuation } from './bloomSkyMask';
import type { createBloomControls } from './controls/bloomControls';
import type { createGodraysControls } from './controls/godraysControls';
import type { createGradeControls } from './controls/gradeControls';
import { depthAwareBlend, type TslNode } from './depthAwareBlend.js';
import { applyLutGrade, applyProceduralPostGrade } from './postGrade';
import { applyVignette } from './vignetteEffect';

type BloomControls = ReturnType<typeof createBloomControls>;
type GodraysControls = ReturnType<typeof createGodraysControls>;
type GradeControls = ReturnType<typeof createGradeControls>;

/** Minimal uniform handle used by the composite (matches `uniform()` from three/tsl). */
type ScalarUniform = ReturnType<typeof import('three/tsl').uniform>;

export interface PipelineCompositeDeps {
  sceneBeauty: TslNode;
  sceneDepth: TslNode;
  camera: import('three').PerspectiveCamera;
  bloomControls: BloomControls;
  godraysControls: GodraysControls;
  gradeControls: GradeControls;
  uExposure: ScalarUniform;
  uVignetteInner: ScalarUniform;
  uVignetteDarkness: ScalarUniform;
  uVignetteEnabled: ScalarUniform;
}

export function createPipelineComposite(deps: PipelineCompositeDeps) {
  const {
    sceneBeauty,
    sceneDepth,
    camera,
    bloomControls,
    godraysControls,
    gradeControls,
    uExposure,
    uVignetteInner,
    uVignetteDarkness,
    uVignetteEnabled,
  } = deps;

  const buildComposite = (withGodrays: boolean, withBloom: boolean) =>
    Fn(() => {
      const uv = screenUV;

      const baseSample = sceneBeauty.sample(uv);
      let sceneRgb = baseSample.rgb;
      // Unreferenced GodraysNode / bilateral blur are skipped by RenderPipeline.
      if (withGodrays) {
        const withRaysSample = depthAwareBlend(
          sceneBeauty,
          godraysControls.godraysBlur.getTextureNode(),
          sceneDepth,
          camera,
          godraysControls.godraysBlendOptions,
        );
        sceneRgb = mix(sceneRgb, withRaysSample.rgb, godraysControls.uGodRaysWeight);
      }
      let bloomed = sceneRgb;
      // Unreferenced BloomNode mip chain is skipped by RenderPipeline.
      if (withBloom) {
        const sceneDepthSample = sceneDepth.sample(uv).r;
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
      const color = applyVignette(toned, uv, uVignetteInner, uVignetteDarkness, uVignetteEnabled);

      return vec4(color, baseSample.a);
    });

  // Stable composite identities — reconnect reuses these instead of buildComposite()() each time.
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
      return vec4(rgb, display.a);
    })();

  return { pickComposite, buildSharpColor };
}
