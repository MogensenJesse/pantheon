// src/rendering/postfx/godrays/GodraysRadialNode.ts — Crevices / GPU Gems 3 occlusion shafts
import type { PerspectiveCamera, Texture } from 'three';
import { HalfFloatType, LinearFilter, MathUtils, Vector2, Vector3 } from 'three';
import {
  abs,
  Fn,
  float,
  If,
  Loop,
  passTexture,
  perspectiveDepthToViewZ,
  screenUV,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  RenderTarget,
  TempNode,
} from 'three/webgpu';
import { godrays as GODRAYS_LOOK, GODRAYS_MAX_SAMPLES } from '../../../config/visual/godrays';
import { CAMERA_FAR } from '../../sceneConstants';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../../sunSpherical';

const MAX_SAMPLES = GODRAYS_MAX_SAMPLES;

/** 5-tap Gaussian (sigma ≈ 1) — kills residual sample rings after the dither is gone. */
const BLUR_W0 = 0.227027;
const BLUR_W1 = 0.316216;
const BLUR_W2 = 0.07027;

const _quadMesh = /*@__PURE__*/ new QuadMesh();
const _size = /*@__PURE__*/ new Vector2();
const _ndc = /*@__PURE__*/ new Vector3();
const _sunDir = /*@__PURE__*/ new Vector3();
const _camFwd = /*@__PURE__*/ new Vector3();

let _rendererState: any;

function configureShaftTarget(rt: InstanceType<typeof RenderTarget>, name: string) {
  const tex = rt.texture as Texture;
  tex.name = name;
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
}

/**
 * Half-res radial occlusion scatter toward the sun's screen position.
 * Only cleared far-plane *view distance* inside a compact sun disc emits;
 * any closer geometry (including distant trees) occludes. Composite additively.
 * No per-pixel dither (that was the stipple); a 5-tap Gaussian smooths the shaft RT.
 */
export class GodraysRadialNode extends TempNode {
  static get type() {
    return 'GodraysRadialNode';
  }

  depthNode: any;
  samples = uniform(GODRAYS_LOOK.SAMPLES);
  density = uniform(GODRAYS_LOOK.DENSITY);
  decay = uniform(GODRAYS_LOOK.DECAY);
  exposure = uniform(GODRAYS_LOOK.EXPOSURE);
  /** View-distance fraction of camera.far where sky emission begins. */
  depthStart = uniform(GODRAYS_LOOK.DEPTH_START);
  depthEnd = uniform(GODRAYS_LOOK.DEPTH_END);
  sunCore = uniform(GODRAYS_LOOK.SUN_CORE);
  sunRadius = uniform(GODRAYS_LOOK.SUN_RADIUS);
  resolutionScale = 0.5;
  updateBeforeType = NodeUpdateType.FRAME;

  private _sunUv = uniform(new Vector2(0.5, 0.5));
  private _aspect = uniform(1);
  private _cameraNear = uniform(0.1);
  private _cameraFar = uniform(CAMERA_FAR);
  private _inFront = uniform(0);
  private _offscreenFade = uniform(0);
  private _offscreenFadeRange = 0.4;
  private _blurDirection = uniform(new Vector2(1, 0));
  private _texelSize = uniform(new Vector2(1, 1));
  private _camera: PerspectiveCamera;
  private _godraysRenderTarget: InstanceType<typeof RenderTarget>;
  private _blurRenderTarget: InstanceType<typeof RenderTarget>;
  private _material: InstanceType<typeof NodeMaterial>;
  private _blurHMaterial: InstanceType<typeof NodeMaterial>;
  private _blurVMaterial: InstanceType<typeof NodeMaterial>;
  private _textureNode: any;
  lastSunUv = { x: 0.5, y: 0.5 };
  lastInFront = 0;
  lastOffscreenFade = 0;

  constructor(depthNode: any, camera: PerspectiveCamera) {
    super('vec4');
    this.depthNode = depthNode;
    this._camera = camera;
    this._godraysRenderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType,
    });
    this._blurRenderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType,
    });
    configureShaftTarget(this._godraysRenderTarget, 'GodraysRadial');
    configureShaftTarget(this._blurRenderTarget, 'GodraysRadialBlur');
    this._material = new NodeMaterial();
    this._material.name = 'GodraysRadial';
    this._material.depthTest = false;
    this._material.depthWrite = false;
    this._blurHMaterial = new NodeMaterial();
    this._blurHMaterial.name = 'GodraysRadialBlurH';
    this._blurHMaterial.depthTest = false;
    this._blurHMaterial.depthWrite = false;
    this._blurVMaterial = new NodeMaterial();
    this._blurVMaterial.name = 'GodraysRadialBlurV';
    this._blurVMaterial.depthTest = false;
    this._blurVMaterial.depthWrite = false;
    this._textureNode = passTexture(this as never, this._godraysRenderTarget.texture as Texture);
  }

  getTextureNode() {
    return this._textureNode;
  }

  setOffscreenFadeRange(range: number) {
    this._offscreenFadeRange = Math.max(0.01, range);
  }

  setSize(width: number, height: number) {
    width = Math.round(this.resolutionScale * width);
    height = Math.round(this.resolutionScale * height);
    this._godraysRenderTarget.setSize(width, height);
    this._blurRenderTarget.setSize(width, height);
  }

  updateBefore(frame: { renderer: any }): boolean | undefined {
    const { renderer } = frame;
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);

    const size = renderer.getDrawingBufferSize(_size);
    this.setSize(size.width, size.height);
    this._aspect.value = size.width / Math.max(size.height, 1);
    this._cameraNear.value = this._camera.near;
    this._cameraFar.value = this._camera.far;
    this._texelSize.value.set(
      1 / Math.max(this._godraysRenderTarget.width, 1),
      1 / Math.max(this._godraysRenderTarget.height, 1),
    );
    this._updateSunScreen();

    _quadMesh.name = 'GodraysRadial';
    renderer.setClearColor(0x000000, 1);

    _quadMesh.material = this._material;
    renderer.setRenderTarget(this._godraysRenderTarget);
    renderer.clear();
    _quadMesh.render(renderer);

    this._blurDirection.value.set(1, 0);
    _quadMesh.material = this._blurHMaterial;
    renderer.setRenderTarget(this._blurRenderTarget);
    renderer.clear();
    _quadMesh.render(renderer);

    this._blurDirection.value.set(0, 1);
    _quadMesh.material = this._blurVMaterial;
    renderer.setRenderTarget(this._godraysRenderTarget);
    renderer.clear();
    _quadMesh.render(renderer);

    RendererUtils.restoreRendererState(renderer, _rendererState);
    return undefined;
  }

  setup() {
    const uvNode = screenUV;
    const sunUv = this._sunUv;
    const depthNode = this.depthNode;

    const godrays = Fn(() => {
      const illum = float(0).toVar();
      const decay = float(1).toVar();
      const coord = uvNode.toVar();
      const n = this.samples;
      const delta = coord.sub(sunUv).div(n).mul(this.density);

      Loop(MAX_SAMPLES, ({ i }) => {
        If(float(i).lessThan(n), () => {
          coord.subAssign(delta);
          const inside = coord.x
            .greaterThanEqual(0)
            .and(coord.x.lessThanEqual(1))
            .and(coord.y.greaterThanEqual(0))
            .and(coord.y.lessThanEqual(1));
          If(inside, () => {
            const depth = depthNode.sample(coord).r;
            const dist = abs(perspectiveDepthToViewZ(depth, this._cameraNear, this._cameraFar));
            const sky = smoothstep(
              this._cameraFar.mul(this.depthStart),
              this._cameraFar.mul(this.depthEnd),
              dist,
            );
            const offset = coord.sub(sunUv);
            const sunDist = vec2(offset.x.mul(this._aspect), offset.y).length();
            const sunGate = float(1).sub(smoothstep(this.sunCore, this.sunRadius, sunDist));
            illum.addAssign(sky.mul(sunGate).mul(decay));
          });
          decay.mulAssign(this.decay);
        });
      });

      const fade = this._inFront.mul(this._offscreenFade);
      const rgb = vec3(illum.mul(this.exposure).mul(fade));
      return vec4(rgb, 1);
    });

    this._material.fragmentNode = godrays();
    this._material.needsUpdate = true;
    this._blurHMaterial.fragmentNode = this._makeBlurFragment(
      texture(this._godraysRenderTarget.texture as Texture),
    );
    this._blurVMaterial.fragmentNode = this._makeBlurFragment(
      texture(this._blurRenderTarget.texture as Texture),
    );
    this._blurHMaterial.needsUpdate = true;
    this._blurVMaterial.needsUpdate = true;
    return this._textureNode;
  }

  dispose() {
    this._godraysRenderTarget.dispose();
    this._blurRenderTarget.dispose();
    this._material.dispose();
    this._blurHMaterial.dispose();
    this._blurVMaterial.dispose();
  }

  private _makeBlurFragment(srcNode: any) {
    return Fn(() => {
      const uv = screenUV;
      const step = this._blurDirection.mul(this._texelSize);
      const acc = srcNode
        .sample(uv)
        .r.mul(BLUR_W0)
        .add(srcNode.sample(uv.add(step)).r.mul(BLUR_W1))
        .add(srcNode.sample(uv.sub(step)).r.mul(BLUR_W1))
        .add(srcNode.sample(uv.add(step.mul(2))).r.mul(BLUR_W2))
        .add(srcNode.sample(uv.sub(step.mul(2))).r.mul(BLUR_W2));
      return vec4(vec3(acc), 1);
    })();
  }

  private _updateSunScreen() {
    // Same spherical dir as SkyMesh — the shadow light may be angle-quantized.
    sunDirectionFromSpherical(currentSunElevationDeg(), currentSunAzimuthDeg(), _sunDir);
    this._camera.updateMatrixWorld();
    this._camera.getWorldDirection(_camFwd);
    const inFront = _sunDir.dot(_camFwd) > 0.02 ? 1 : 0;

    _ndc.copy(this._camera.position).addScaledVector(_sunDir, 1e4);
    _ndc.project(this._camera);

    // WebGPU / screenUV: (0,0) is top-left. Vector3.project() is OpenGL NDC (y-up).
    const u = _ndc.x * 0.5 + 0.5;
    const v = 0.5 - _ndc.y * 0.5;
    this._sunUv.value.set(u, v);

    const chebyshev = Math.max(Math.abs(_ndc.x), Math.abs(_ndc.y));
    const offscreenFade = 1 - MathUtils.smoothstep(chebyshev, 1, 1 + this._offscreenFadeRange);

    this._inFront.value = inFront;
    this._offscreenFade.value = offscreenFade;
    this.lastSunUv.x = u;
    this.lastSunUv.y = v;
    this.lastInFront = inFront;
    this.lastOffscreenFade = offscreenFade * inFront;
  }
}

export function godraysRadial(depthNode: any, camera: PerspectiveCamera) {
  return new GodraysRadialNode(depthNode, camera);
}
