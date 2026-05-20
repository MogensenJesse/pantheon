// src/rendering/PostFX.ts
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Vector2, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { PHASE0 } from '../config/phase0';
import { darkenNonBloomed, restoreNonBloomed } from './bloomLayer';

const { BLOOM } = PHASE0;

const BloomCompositeShader = {
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: null },
    bloomStrength: { value: 1.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    uniform float bloomStrength;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(baseTexture, vUv);
      vec4 bloom = texture2D(bloomTexture, vUv);
      gl_FragColor = base + bloom * bloomStrength;
    }
  `,
};

const PixelationShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new Vector2(1, 1) },
    pixelSize: { value: 1 },
    colorLevels: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    uniform float colorLevels;
    varying vec2 vUv;
    void main() {
      vec2 block = pixelSize / resolution;
      vec2 uv = block * floor(vUv / block);
      vec4 texel = texture2D(tDiffuse, uv);
      if (colorLevels > 1.0) {
        texel.rgb = floor(texel.rgb * colorLevels) / colorLevels;
      }
      gl_FragColor = texel;
    }
  `,
};

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    innerRadius: { value: 0.3 },
    darkness: { value: 0.95 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float innerRadius;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float dist = length(vUv - vec2(0.5)) * 2.0;
      float vignette = smoothstep(innerRadius, 1.42, dist) * darkness;
      gl_FragColor = vec4(texel.rgb * (1.0 - vignette), texel.a);
    }
  `,
};

export interface PostFXContext {
  composer: EffectComposer;
  render: () => void;
  resize: (width: number, height: number) => void;
  setVignetteStrength: (energyRatio: number) => void;
  disableVignette: () => void;
  setPixelSize: (size: number) => void;
  setColorLevels: (levels: number) => void;
  setRenderQuality: (high: boolean) => void;
}

let activeComposer: EffectComposer | null = null;
let activeBloomComposer: EffectComposer | null = null;

export function initPostFX(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): PostFXContext {
  const size = new Vector2(window.innerWidth, window.innerHeight);

  const bloomComposer = new EffectComposer(renderer);
  activeBloomComposer = bloomComposer;
  bloomComposer.setPixelRatio(1);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));

  let bloomScale: number = BLOOM.RESOLUTION_SCALE_LOW;
  const bloomPass = new UnrealBloomPass(
    size.clone(),
    BLOOM.STRENGTH,
    BLOOM.RADIUS,
    BLOOM.THRESHOLD,
  );
  bloomComposer.addPass(bloomPass);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.addPass(new RenderPass(scene, camera));

  const bloomCompositePass = new ShaderPass(BloomCompositeShader, 'baseTexture');
  bloomCompositePass.uniforms['bloomStrength'].value = BLOOM.COMPOSITE_STRENGTH;
  composer.addPass(bloomCompositePass);

  const pixelPass = new ShaderPass(PixelationShader);
  pixelPass.uniforms['resolution'].value.set(window.innerWidth, window.innerHeight);
  composer.addPass(pixelPass);

  const vignettePass = new ShaderPass(VignetteShader);
  composer.addPass(vignettePass);

  composer.addPass(new OutputPass());
  activeComposer = composer;

  const applyBloomResolution = (width: number, height: number) => {
    const bw = Math.floor(width * bloomScale);
    const bh = Math.floor(height * bloomScale);
    bloomPass.resolution.set(bw, bh);
    bloomComposer.setSize(bw, bh);
  };

  applyBloomResolution(window.innerWidth, window.innerHeight);

  return {
    composer,
    render: () => {
      darkenNonBloomed(scene);
      bloomComposer.render();
      restoreNonBloomed();

      bloomCompositePass.uniforms['bloomTexture'].value =
        bloomComposer.readBuffer.texture;
      composer.render();
    },
    resize: (width, height) => {
      composer.setSize(width, height);
      applyBloomResolution(width, height);
      pixelPass.uniforms['resolution'].value.set(width, height);
    },
    setVignetteStrength: (energyRatio: number) => {
      vignettePass.uniforms['innerRadius'].value = 0.3 + energyRatio * 0.55;
      vignettePass.uniforms['darkness'].value = 0.95 - energyRatio * 0.55;
    },
    disableVignette: () => {
      vignettePass.enabled = false;
    },
    setPixelSize: (size: number) => {
      pixelPass.uniforms['pixelSize'].value = Math.max(1, size);
    },
    setColorLevels: (levels: number) => {
      pixelPass.uniforms['colorLevels'].value = Math.max(1, levels);
    },
    setRenderQuality: (high: boolean) => {
      bloomScale = high ? BLOOM.RESOLUTION_SCALE_HIGH : BLOOM.RESOLUTION_SCALE_LOW;
      bloomPass.strength = high ? BLOOM.STRENGTH_HIGH : BLOOM.STRENGTH;
      applyBloomResolution(window.innerWidth, window.innerHeight);
    },
  };
}

export function disposePostFX(): void {
  activeComposer?.dispose();
  activeBloomComposer?.dispose();
  activeComposer = null;
  activeBloomComposer = null;
}
