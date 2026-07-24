// src/rendering/postfx/godrays/GodraysNodeDirectional.d.ts
import type { Camera, DirectionalLight, Texture } from 'three';
import type { TextureNode } from 'three/tsl';
import type GodraysNode from 'three/addons/tsl/display/GodraysNode.js';

export declare class GodraysNodeDirectional extends GodraysNode {
  setPcssColorDepthTexture(getter: (() => Texture | null) | null): void;
  setPreferManualShadow(enabled: boolean): void;
  setCloudCastLight(light: DirectionalLight | null): void;
  /** @internal */ _syncShadowDepthSource(): void;
  /** @internal */ _syncCloudShadowDepthSource(): void;
}

export declare function godraysDirectional(
  depthNode: TextureNode,
  camera: Camera,
  light: DirectionalLight,
): GodraysNodeDirectional;

export default GodraysNodeDirectional;
