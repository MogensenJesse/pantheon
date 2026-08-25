// src/editor/place/editorPropPreviewLod.ts — lowest LOD for editor prop previews

/** Map prop LOD band used for all editor scene previews (lod2 = far / simplest mesh). */
export const EDITOR_PROP_PREVIEW_LOD = 2 as const;

export type EditorPropPreviewLod = 0 | 1 | 2;
