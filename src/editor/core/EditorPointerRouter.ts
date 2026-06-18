// src/editor/core/EditorPointerRouter.ts — explicit LMB priority between terrain, entity, gizmo

export interface EditorPointerRouter {
  blockTerrainPointer: () => void;
  blockEntityPointer: () => void;
  consumeEntityPointerBlock: () => boolean;
  consumeTerrainPointerBlock: () => boolean;
}

export function createEditorPointerRouter(): EditorPointerRouter {
  let blockTerrain = false;
  let blockEntity = false;

  return {
    blockTerrainPointer: () => {
      blockTerrain = true;
    },
    blockEntityPointer: () => {
      blockEntity = true;
    },
    consumeEntityPointerBlock: () => {
      if (!blockEntity) return false;
      blockEntity = false;
      return true;
    },
    consumeTerrainPointerBlock: () => {
      if (!blockTerrain) return false;
      blockTerrain = false;
      return true;
    },
  };
}
