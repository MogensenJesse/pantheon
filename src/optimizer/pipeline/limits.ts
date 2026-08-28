// src/optimizer/pipeline/limits.ts — conservative input / GPU budgets
export const MAX_IMPORT_BYTES = 96 * 1024 * 1024;
export const MAX_SOURCE_TRIANGLES = 1_500_000;
export const MAX_SAVE_GLB_BYTES = 64 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 256;
export const MAX_BVH_STORAGE_BYTES = 100 * 1024 * 1024;
export const MAX_BAKE_MATERIALS = 24;
