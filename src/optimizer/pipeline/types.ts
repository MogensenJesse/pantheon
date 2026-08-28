// src/optimizer/pipeline/types.ts — optimizer geometry / bake contracts

export type TopologyMode = 'preserveUv' | 'rebuild';
export type RemeshFlag = 'Shell' | 'Solve';

export interface OptimizerSettings {
  topology: TopologyMode;
  targetTriangles: number;
  textureSize: 512 | 1024 | 2048;
  remeshFlags: RemeshFlag[];
  alphaHoles: boolean;
  interactivePreview: boolean;
  emitLodChain: boolean;
  lit: boolean;
  wireframe: boolean;
}

export const DEFAULT_OPTIMIZER_SETTINGS: OptimizerSettings = {
  topology: 'preserveUv',
  targetTriangles: 8000,
  textureSize: 1024,
  remeshFlags: ['Shell'],
  alphaHoles: false,
  interactivePreview: true,
  emitLodChain: true,
  lit: true,
  wireframe: false,
};

export interface MeshStats {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  drawCalls: number;
  textureBytesEst: number;
}

export interface PrimitivePayload {
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  colors: Float32Array | null;
  tangents?: Float32Array | null;
  indices: Uint32Array;
  materialName: string;
  materialIndex: number;
}

export interface OptimizerSaveFields extends OptimizerSettings {
  family: string;
  name: string;
  overwrite: boolean;
}

export interface GeometryJobResult {
  generation: number;
  primitives: PrimitivePayload[];
  stats: MeshStats;
  warnings: string[];
  notes: string[];
  atlasWidth?: number;
  atlasHeight?: number;
}

export type OptimizerIssueSeverity = 'block' | 'warn' | 'info';

export interface OptimizerIssue {
  severity: OptimizerIssueSeverity;
  code: string;
  message: string;
}

export interface StaticValidation {
  ok: boolean;
  issues: OptimizerIssue[];
  triangleCount: number;
  meshCount: number;
  materialNames: string[];
  hasVertexColor: boolean;
  hasAlphaCutout: boolean;
  renderClasses: string[];
  rebuildAllowed: boolean;
  embeddedLod: boolean;
  sourceBytes: number;
}
