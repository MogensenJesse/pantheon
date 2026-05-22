// src/world/grass/GrassBlade.ts — procedural curved blades (v2, no Bermuda atlas sampling)
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  type AmbientLight,
  type Camera,
  type DirectionalLight,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  clamp,
  color,
  dot,
  float,
  hash,
  max,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { devSettings } from '../../core/GameState';
import { PHASE0 } from '../../config/phase0';
import { ensureGeometryUv } from '../../rendering/ensureGeometryUv';
import type { TerrainContext } from '../TerrainGenerator';

const { GRASS: G } = PHASE0;

export interface GrassBladeInstance {
  x: number;
  z: number;
  yRotation: number;
  heightScale: number;
  widthScale: number;
  bend: number;
  hueJitter: number;
  windPhase: number;
  variant: number;
}

export interface GrassBladeUniforms {
  uSunDirection: { value: Vector3 };
  uViewCamPos: { value: Vector3 };
  uSunIntensity: { value: number };
  uAmbientIntensity: { value: number };
  uBendStrength: { value: number };
  uHueVariation: { value: number };
  uPatchNoiseStrength: { value: number };
  uAoStrength: { value: number };
  uRimStrength: { value: number };
  uSssStrength: { value: number };
}

const _matrix = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scl = new Vector3();
const _euler = new Euler();
const _sunDir = new Vector3();
const _lastSunDir = new Vector3();
const _lastCamPos = new Vector3();
let _lastSunIntensity = -1;
let _lastAmbientIntensity = -1;

let sharedGeometry: BufferGeometry | null = null;
let sharedMaterial: MeshBasicNodeMaterial | null = null;
let grassUniforms: GrassBladeUniforms | null = null;

/** v2: no Bermuda load — textures reserved for Phase 2 impostor atlas. */
export async function initGrassBlade(): Promise<void> {
  getSharedGrassAssets();
}

/** Curved blade strip with mid-rib crease (V-shaped in Z). Bend applied in TSL via iBend. */
function createCurvedBladeGeometry(segments: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ribZ = 0.06;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = t;
    const halfW = (1 - t * 0.92) * 0.5;
    const zL = t * t * 0.12;
    const zR = t * t * 0.12 + ribZ * (1 - t);
    positions.push(-halfW, y, zL, halfW, y, zR);
    uvs.push(0.06, t, 0.94, t);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setIndex(new Uint16BufferAttribute(indices, 1));
  ensureGeometryUv(geo);

  const dummy = new InstancedBufferAttribute(new Float32Array([1]), 1);
  geo.setAttribute('iBend', dummy);
  geo.setAttribute('iHue', dummy);
  geo.setAttribute('iPhase', dummy);
  geo.setAttribute('iVariant', dummy);
  return geo;
}

function createProceduralGrassMaterial(): MeshBasicNodeMaterial {
  const uTint = uniform(new Color(G.COLOR_TINT.r, G.COLOR_TINT.g, G.COLOR_TINT.b));
  const uSunDirection = uniform(new Vector3(0.55, 0.75, 0.45).normalize());
  const uViewCamPos = uniform(new Vector3());
  const uSunIntensity = uniform(1);
  const uAmbientIntensity = uniform(0.04);
  const uBendStrength = uniform(1);
  const uHueVariation = uniform(1);
  const uPatchNoiseStrength = uniform(G.PATCH_NOISE_STRENGTH);
  const uAoStrength = uniform(G.AO_STRENGTH);
  const uRimStrength = uniform(G.RIM_STRENGTH);
  const uSssStrength = uniform(G.SSS_STRENGTH);

  grassUniforms = {
    uSunDirection,
    uViewCamPos,
    uSunIntensity,
    uAmbientIntensity,
    uBendStrength,
    uHueVariation,
    uPatchNoiseStrength,
    uAoStrength,
    uRimStrength,
    uSssStrength,
  };

  const iBend = attribute('iBend', 'float');
  const iHue = attribute('iHue', 'float');
  const iPhase = attribute('iPhase', 'float');
  const iVariant = attribute('iVariant', 'float');

  const bladeAlpha = Fn(() => {
    const u = uv();
    const vertical = smoothstep(float(0.02), float(0.22), u.y).mul(
      smoothstep(float(1.0), float(0.68), u.y),
    );
    const horizontal = smoothstep(float(0.48), float(0.04), abs(u.x.sub(0.5)).mul(2));
    return vertical.mul(horizontal);
  });

  const displaced = Fn(() => {
    const u = uv();
    const t = u.y;
    const tipW = t.mul(t);

    const gust = sin(
      time
        .mul(G.WIND_SPEED)
        .add(positionWorld.x.mul(0.11))
        .add(positionWorld.z.mul(0.09)),
    );
    const localSway = sin(time.mul(G.WIND_SPEED).add(iPhase).add(positionLocal.x.mul(14)));
    const sway = gust.mul(0.55).add(localSway.mul(0.45));
    const swayX = sway.mul(tipW).mul(G.WIND_STRENGTH);
    const swayZ = sway.mul(tipW).mul(G.WIND_STRENGTH * 0.45);

    const bendZ = t.mul(t).mul(iBend).mul(uBendStrength).mul(0.22);
    const wideX = mix(float(1), float(G.BLADE_WIDE_WIDTH_MUL), iVariant);
    const pos = vec3(positionLocal.x.mul(wideX), positionLocal.y, positionLocal.z.add(bendZ));
    return pos.add(vec3(swayX, 0, swayZ));
  });

  const shadeColor = Fn(() => {
    const u = uv();
    const baseCol = color(G.COLOR_BASE);
    const tipCol = color(G.COLOR_TIP);
    const dryCol = color(G.COLOR_DRY);
    const gradient = mix(baseCol, tipCol, smoothstep(float(0), float(1), u.y));

    const patchN = hash(positionWorld.xz.mul(float(G.PATCH_NOISE_SCALE)));
    const patchMix = mix(float(1).sub(uPatchNoiseStrength.mul(0.45)), float(1), patchN);
    const withDry = mix(
      gradient,
      dryCol,
      patchN.mul(uPatchNoiseStrength).mul(float(0.35)),
    );
    const hueShift = iHue.mul(uHueVariation).mul(float(0.12));
    const withHue = mix(withDry, dryCol, clamp(hueShift, 0, 1));

    const ao = mix(float(1), float(0.52), smoothstep(float(0.38), float(0), u.y).mul(uAoStrength));
    const shaded = withHue.mul(ao);

    const viewDir = normalize(uViewCamPos.sub(positionWorld));
    const edge = smoothstep(float(0.42), float(0.06), abs(u.x.sub(0.5)).mul(2));
    const sceneLight = uAmbientIntensity.add(uSunIntensity);
    const grassLit = smoothstep(float(0.06), float(0.42), sceneLight);
    const albedoLight = clamp(sceneLight.mul(0.55), float(0), float(1.1));

    const rim = edge.mul(uRimStrength).mul(albedoLight);
    const rimAdd = vec3(rim, rim, rim.mul(0.85));

    const backlight = max(dot(uSunDirection, viewDir), float(0))
      .mul(uSssStrength)
      .mul(u.y)
      .mul(sceneLight);
    const sssAdd = vec3(
      backlight.mul(0.35),
      backlight.mul(0.55),
      backlight.mul(0.12),
    );

    const lit = shaded.mul(albedoLight).add(rimAdd).add(sssAdd);
    return lit.mul(uTint).mul(patchMix).mul(grassLit);
  });

  const sceneLightForAlpha = Fn(() => {
    const sceneLight = uAmbientIntensity.add(uSunIntensity);
    return smoothstep(float(0.06), float(0.42), sceneLight);
  });

  const mat = new MeshBasicNodeMaterial({
    transparent: true,
    alphaTest: G.ALPHA_TEST,
    side: DoubleSide,
    depthWrite: true,
  });
  mat.positionNode = displaced();
  mat.colorNode = shadeColor();
  mat.opacityNode = bladeAlpha().mul(sceneLightForAlpha());
  return mat;
}

function getSharedGrassAssets(): { geometry: BufferGeometry; material: MeshBasicNodeMaterial } {
  if (!sharedGeometry) sharedGeometry = createCurvedBladeGeometry(G.BLADE_SEGMENTS);
  if (!sharedMaterial) {
    sharedMaterial = createProceduralGrassMaterial();
    applyGrassDevUniforms();
  }
  return { geometry: sharedGeometry, material: sharedMaterial };
}

export function applyGrassDevUniforms(): void {
  if (!grassUniforms) return;
  const g = devSettings.grass;
  grassUniforms.uBendStrength.value = g.bendStrength;
  grassUniforms.uHueVariation.value = g.hueVariation;
  grassUniforms.uPatchNoiseStrength.value = g.patchNoiseEnabled
    ? G.PATCH_NOISE_STRENGTH
    : 0;
}

export function syncGrassBladeLighting(
  sun: DirectionalLight,
  ambient: AmbientLight,
  camera: Camera,
): void {
  if (!grassUniforms) return;
  _sunDir.copy(sun.position).sub(sun.target.position).normalize();
  const sunMoved =
    _lastSunDir.distanceToSquared(_sunDir) > 1e-8 ||
    Math.abs(_lastSunIntensity - sun.intensity) > 1e-4 ||
    Math.abs(_lastAmbientIntensity - ambient.intensity) > 1e-4;
  const camMoved = _lastCamPos.distanceToSquared(camera.position) > 1e-4;
  if (!sunMoved && !camMoved) return;

  (grassUniforms.uSunDirection.value as Vector3).copy(_sunDir);
  (grassUniforms.uViewCamPos.value as Vector3).copy(camera.position);
  grassUniforms.uSunIntensity.value = sun.intensity;
  grassUniforms.uAmbientIntensity.value = ambient.intensity;
  _lastSunDir.copy(_sunDir);
  _lastSunIntensity = sun.intensity;
  _lastAmbientIntensity = ambient.intensity;
  _lastCamPos.copy(camera.position);
}

function writeInstance(
  mesh: InstancedMesh,
  index: number,
  blade: GrassBladeInstance,
  terrain: TerrainContext,
): void {
  const y = terrain.getWorldY(blade.x, blade.z) + G.SURFACE_LIFT;
  _pos.set(blade.x, y, blade.z);
  _euler.set(0, blade.yRotation, 0);
  _quat.setFromEuler(_euler);
  const h = G.BLADE_HEIGHT * blade.heightScale;
  const w = G.BLADE_WIDTH * blade.widthScale;
  _scl.set(w, h, w);
  _matrix.compose(_pos, _quat, _scl);
  mesh.setMatrixAt(index, _matrix);
}

function attachInstancedAttributes(mesh: InstancedMesh, blades: GrassBladeInstance[]): void {
  const n = blades.length;
  const iBend = new Float32Array(n);
  const iHue = new Float32Array(n);
  const iPhase = new Float32Array(n);
  const iVariant = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    iBend[i] = blades[i].bend;
    iHue[i] = blades[i].hueJitter;
    iPhase[i] = blades[i].windPhase;
    iVariant[i] = blades[i].variant;
  }
  const geo = mesh.geometry;
  geo.setAttribute('iBend', new InstancedBufferAttribute(iBend, 1));
  geo.setAttribute('iHue', new InstancedBufferAttribute(iHue, 1));
  geo.setAttribute('iPhase', new InstancedBufferAttribute(iPhase, 1));
  geo.setAttribute('iVariant', new InstancedBufferAttribute(iVariant, 1));
}

/** One instanced draw for many procedural grass blades in a chunk. */
export function buildGrassBladeInstancedMesh(
  blades: GrassBladeInstance[],
  terrain: TerrainContext,
): InstancedMesh {
  const { geometry: baseGeo, material } = getSharedGrassAssets();
  const geometry = baseGeo.clone();
  const mesh = new InstancedMesh(geometry, material, blades.length);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  blades.forEach((b, i) => writeInstance(mesh, i, b, terrain));
  mesh.instanceMatrix.needsUpdate = true;
  attachInstancedAttributes(mesh, blades);
  mesh.computeBoundingSphere();
  return mesh;
}

export function disposeGrassBladeShared(): void {
  sharedGeometry?.dispose();
  sharedMaterial?.dispose();
  sharedGeometry = null;
  sharedMaterial = null;
  grassUniforms = null;
}
