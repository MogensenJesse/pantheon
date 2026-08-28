// src/optimizer/pipeline/validateStaticAsset.ts — static-prop gate for optimizer import
import type { AnimationClip, BufferGeometry, Material, Object3D } from 'three';
import { classifyPropMaterial } from '../../world/mapProps/config/mapPropShadowUniforms';
import { MAX_SOURCE_TRIANGLES } from './limits';
import { countGeometry } from './stats';
import type { OptimizerIssue, StaticValidation } from './types';

function isMeshLike(
  obj: Object3D,
): obj is Object3D & { geometry: BufferGeometry; material: Material | Material[] } {
  return (obj as { isMesh?: boolean }).isMesh === true;
}

function materialName(mat: Material | undefined): string {
  return mat?.name?.trim() || 'Material';
}

function isAlphaCutout(mat: Material): boolean {
  const m = mat as Material & {
    alphaTest?: number;
    transparent?: boolean;
    map?: { format?: number };
  };
  return (m.alphaTest ?? 0) > 0 || m.transparent === true;
}

export function validateStaticAsset(
  root: Object3D,
  clips: AnimationClip[] | undefined,
  opts?: { sourceBytes?: number; embeddedLod?: boolean },
): StaticValidation {
  const issues: OptimizerIssue[] = [];
  const materialNames: string[] = [];
  const renderClasses = new Set<string>();
  let hasVertexColor = false;
  let hasAlphaCutout = false;
  let meshCount = 0;

  if (clips && clips.length > 0) {
    issues.push({
      severity: 'block',
      code: 'animation',
      message: `Scene has ${clips.length} animation clip(s). Optimizer v1 is static props only.`,
    });
  }

  root.traverse((obj) => {
    const anyObj = obj as Object3D & {
      isSkinnedMesh?: boolean;
      isPoints?: boolean;
      isLine?: boolean;
      isLineSegments?: boolean;
      isSprite?: boolean;
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    if (anyObj.isSkinnedMesh) {
      issues.push({
        severity: 'block',
        code: 'skin',
        message: `Skinned mesh "${obj.name || '(unnamed)'}" is not supported.`,
      });
    }
    if (anyObj.isPoints || anyObj.isLine || anyObj.isLineSegments || anyObj.isSprite) {
      issues.push({
        severity: 'block',
        code: 'non-triangle',
        message: `Non-triangle drawable "${obj.name || obj.type}" is not supported.`,
      });
    }
    const geo = anyObj.geometry;
    if (geo?.morphAttributes && Object.keys(geo.morphAttributes).length > 0) {
      issues.push({
        severity: 'block',
        code: 'morph',
        message: `Morph targets on "${obj.name || '(unnamed)'}" are not supported.`,
      });
    }
    if (!isMeshLike(obj)) return;
    meshCount += 1;
    if (obj.geometry.getAttribute('color')) hasVertexColor = true;
    if (!obj.geometry.getAttribute('uv')) {
      issues.push({
        severity: 'warn',
        code: 'missing-uv',
        message: `Mesh "${obj.name || '(unnamed)'}" has no UVs. Preserve-UV simplify needs UVs; Rebuild will unwrap a new atlas.`,
      });
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      const name = materialName(mat);
      materialNames.push(name);
      const cls = classifyPropMaterial(name);
      renderClasses.add(cls.category);
      if (isAlphaCutout(mat) || cls.category === 'foliage') {
        hasAlphaCutout = hasAlphaCutout || isAlphaCutout(mat) || cls.category === 'foliage';
      }
      const type = mat.type ?? '';
      if (
        type.includes('Shader') ||
        type === 'RawShaderMaterial' ||
        type === 'GLTFMeshGpuInstancing'
      ) {
        issues.push({
          severity: 'block',
          code: 'custom-shader',
          message: `Custom/unsupported material "${name}" (${type}).`,
        });
      }
    }
  });

  if (meshCount === 0) {
    issues.push({
      severity: 'block',
      code: 'no-mesh',
      message: 'No triangle meshes found in the imported scene.',
    });
  }

  if (hasAlphaCutout) {
    issues.push({
      severity: 'warn',
      code: 'alpha',
      message:
        'Alpha-cutout / foliage materials detected. Preserve UVs is the supported path; Rebuild is blocked.',
    });
  }

  const uniqueClasses = [...renderClasses];
  const mixedClass = uniqueClasses.length > 1;
  if (mixedClass) {
    issues.push({
      severity: 'warn',
      code: 'mixed-class',
      message: `Mixed Pantheon render classes (${uniqueClasses.join(', ')}). Rebuild would merge materials and break play shading.`,
    });
  }

  if (opts?.embeddedLod) {
    issues.push({
      severity: 'warn',
      code: 'embedded-lod',
      message:
        'This catalog asset uses embedded extractLod1/extractLod2. Project save cannot overwrite it with sibling LOD files — pick a new family/name.',
    });
  }

  const rebuildAllowed =
    !issues.some((i) => i.severity === 'block') &&
    !hasAlphaCutout &&
    !mixedClass &&
    uniqueClasses.every((c) => c === 'default');

  const stats = countGeometry(root);
  if (stats.triangles > MAX_SOURCE_TRIANGLES) {
    issues.push({
      severity: 'block',
      code: 'too-large',
      message: `Source has ${Math.round(stats.triangles).toLocaleString()} triangles (max ${MAX_SOURCE_TRIANGLES.toLocaleString()}).`,
    });
  }
  const ok = !issues.some((i) => i.severity === 'block');
  return {
    ok,
    issues,
    triangleCount: stats.triangles,
    meshCount: stats.meshes,
    materialNames: [...new Set(materialNames)],
    hasVertexColor,
    hasAlphaCutout,
    renderClasses: uniqueClasses,
    rebuildAllowed,
    embeddedLod: Boolean(opts?.embeddedLod),
    sourceBytes: opts?.sourceBytes ?? 0,
  };
}

export function rebuildBlockReason(validation: StaticValidation): string | null {
  if (validation.rebuildAllowed) return null;
  if (validation.hasAlphaCutout) {
    return 'Rebuild is blocked for alpha-cutout foliage. Use Preserve UVs so leaf cards and material names stay intact.';
  }
  if (validation.renderClasses.length > 1) {
    return 'Rebuild is blocked for mixed bark/leaf/default materials. Use Preserve UVs.';
  }
  if (validation.renderClasses.some((c) => c !== 'default')) {
    return 'Rebuild v1 is limited to opaque default/rock-class materials.';
  }
  const block = validation.issues.find((i) => i.severity === 'block');
  return block?.message ?? 'Rebuild is not available for this asset.';
}
