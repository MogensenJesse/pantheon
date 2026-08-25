// src/editor/session/editorSessionChrome.ts — document bar, docks, library, and property panels

import type { AssetRegistry } from '../../assets/assetManifest';
import type { EditorPropMixModel } from '../core/EditorPropMixModel';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import {
  createEditorMapDocument,
  type EditorMapDocumentContext,
  type EditorMapDocumentHandlers,
} from '../document/EditorMapDocument';
import type { EditorAssetThumbnailService } from '../ui/EditorAssetThumbnails';
import { createEditorAssetBrowser } from '../ui/EditorAssetBrowser';
import { createEditorBiomeBrowser, type EditorBiomeBrowserHandlers } from '../ui/EditorBiomeBrowser';
import {
  createEditorDocumentBar,
  type EditorDocumentBarHandlers,
} from '../ui/EditorDocumentBar';
import type { EditorDialogService } from '../ui/editorDialog';
import { createEditorInfoPopup } from '../ui/EditorInfoPopup';
import type { EditorToastService } from '../ui/editorToast';
import {
  createEditorPropertiesTabs,
  type EditorPropertiesTabsHandlers,
} from '../ui/EditorPropertiesTabs';
import { createEditorToolRail, type EditorToolRailHandlers } from '../ui/EditorToolRail';
import {
  createPaintPropertiesPanel,
  type PaintPropertiesPanelHandlers,
} from '../ui/PaintPropertiesPanel';
import {
  createPlacePropertiesPanel,
  type PlacePropertiesPanelHandlers,
} from '../ui/PlacePropertiesPanel';
import {
  createSculptPropertiesPanel,
  type SculptPropertiesPanelHandlers,
} from '../ui/SculptPropertiesPanel';
import type { EditorShellContext } from '../ui/shell/EditorShell';

export interface EditorSessionChromeServices {
  toast: EditorToastService;
  dialog: EditorDialogService;
  thumbnails: EditorAssetThumbnailService;
}

export interface EditorSessionChromeDeps {
  shell: EditorShellContext;
  store: EditorWorkspaceStore;
  assets: AssetRegistry;
  mix: EditorPropMixModel;
  services: EditorSessionChromeServices;
  mapDocumentHandlers: EditorMapDocumentHandlers;
  documentBarHandlers: EditorDocumentBarHandlers;
  toolRailHandlers: EditorToolRailHandlers;
  propertiesTabsHandlers: EditorPropertiesTabsHandlers;
  biomeHandlers: EditorBiomeBrowserHandlers;
  sculptHandlers: SculptPropertiesPanelHandlers;
  paintHandlers: PaintPropertiesPanelHandlers;
  placeHandlers: PlacePropertiesPanelHandlers;
}

export interface EditorSessionChrome {
  mapDocument: EditorMapDocumentContext;
  sculptProps: ReturnType<typeof createSculptPropertiesPanel>;
  placeProps: ReturnType<typeof createPlacePropertiesPanel>;
  syncTerrainShape: () => void;
  refreshFillEstimate: () => void;
  dispose: () => void;
}

export function createEditorSessionChrome(deps: EditorSessionChromeDeps): EditorSessionChrome {
  const {
    shell,
    store,
    assets,
    mix,
    services,
    mapDocumentHandlers,
    documentBarHandlers,
    toolRailHandlers,
    propertiesTabsHandlers,
    biomeHandlers,
    sculptHandlers,
    paintHandlers,
    placeHandlers,
  } = deps;

  let mapDocument!: EditorMapDocumentContext;

  const documentBar = createEditorDocumentBar(shell.slots.documentBar, store, () => mapDocument, documentBarHandlers);

  mapDocument = createEditorMapDocument(documentBar.mapList, mapDocumentHandlers, services);

  const toolRail = createEditorToolRail(shell.slots.toolRail, store, toolRailHandlers);
  const infoPopup = createEditorInfoPopup(shell.slots.toolRail, store);
  const propertiesTabs = createEditorPropertiesTabs(
    shell.slots.propertiesTabs,
    store,
    propertiesTabsHandlers,
  );
  const assetBrowser = createEditorAssetBrowser(
    shell.slots.libraryBody,
    assets,
    store,
    mix,
    services.thumbnails,
  );
  const biomeBrowser = createEditorBiomeBrowser(shell.slots.libraryBody, store, biomeHandlers);
  const sculptProps = createSculptPropertiesPanel(shell.slots.propertiesBody, store, sculptHandlers);
  const paintProps = createPaintPropertiesPanel(shell.slots.propertiesBody, store, paintHandlers);
  const placeProps = createPlacePropertiesPanel(shell.slots.propertiesBody, store, mix, placeHandlers);
  return {
    mapDocument,
    sculptProps,
    placeProps,
    syncTerrainShape: () => sculptProps.syncTerrainShape(),
    refreshFillEstimate: () => placeProps.refreshFillEstimate(),
    dispose: () => {
      toolRail.dispose();
      assetBrowser.dispose();
      biomeBrowser.dispose();
      sculptProps.dispose();
      paintProps.dispose();
      placeProps.dispose();
      documentBar.dispose();
      infoPopup.dispose();
      propertiesTabs.dispose();
      mapDocument.dispose();
    },
  };
}
