// src/editor/ui/shell/EditorShell.ts — dual-dock editor chrome slots

import { focusEditorViewport } from '../../core/editorFormGuards';
import type { EditorWorkspaceState } from '../../core/EditorWorkspaceStore';
import { isLibraryAvailable } from '../../core/EditorWorkspaceStore';

export interface EditorShellSlots {
  root: HTMLElement;
  documentBar: HTMLElement;
  toolRail: HTMLElement;
  library: HTMLElement;
  libraryTitle: HTMLElement;
  libraryBody: HTMLElement;
  properties: HTMLElement;
  propertiesTitle: HTMLElement;
  propertiesTabs: HTMLElement;
  propertiesBody: HTMLElement;
  viewport: HTMLElement;
  overlays: HTMLElement;
  canvas: HTMLCanvasElement;
}

export interface EditorShellContext {
  slots: EditorShellSlots;
  syncLayout: (state: EditorWorkspaceState) => void;
  dispose: () => void;
}

export function createEditorShell(host: HTMLElement): EditorShellContext {
  host.className = 'editor-app';
  host.hidden = false;
  host.innerHTML = `
    <header class="editor-document-bar" data-slot="document-bar"></header>
    <div class="editor-body">
      <nav class="editor-tool-rail" data-slot="tool-rail" aria-label="Tools"></nav>
      <aside class="editor-dock editor-library-dock" id="editor-library-dock" data-slot="library">
        <div class="editor-dock-header">
          <h2 data-slot="library-title">Library</h2>
        </div>
        <div class="editor-dock-body" data-slot="library-body"></div>
      </aside>
      <main class="editor-viewport" data-slot="viewport">
        <canvas id="editor" tabindex="0" role="img" aria-label="Map editor viewport"></canvas>
        <aside class="editor-properties-float" id="editor-properties-dock" data-slot="properties">
          <div class="editor-dock-header editor-properties-header">
            <h2 data-slot="properties-title">Properties</h2>
            <div data-slot="properties-tabs"></div>
          </div>
          <div class="editor-dock-body" data-slot="properties-body"></div>
        </aside>
        <div class="editor-overlays" data-slot="overlays"></div>
      </main>
    </div>
  `;

  const canvas = host.querySelector<HTMLCanvasElement>('#editor');
  if (!canvas) throw new Error('Editor shell is missing #editor canvas');

  const slots: EditorShellSlots = {
    root: host,
    documentBar: host.querySelector('[data-slot="document-bar"]')!,
    toolRail: host.querySelector('[data-slot="tool-rail"]')!,
    library: host.querySelector('[data-slot="library"]')!,
    libraryTitle: host.querySelector('[data-slot="library-title"]')!,
    libraryBody: host.querySelector('[data-slot="library-body"]')!,
    properties: host.querySelector('[data-slot="properties"]')!,
    propertiesTitle: host.querySelector('[data-slot="properties-title"]')!,
    propertiesTabs: host.querySelector('[data-slot="properties-tabs"]')!,
    propertiesBody: host.querySelector('[data-slot="properties-body"]')!,
    viewport: host.querySelector('[data-slot="viewport"]')!,
    overlays: host.querySelector('[data-slot="overlays"]')!,
    canvas,
  };

  const libraryTitleFor = (state: EditorWorkspaceState) => {
    if (state.tool === 'paint') return 'Biomes';
    if (state.tool === 'place') return 'Assets';
    return 'Library';
  };

  const propertiesTitleFor = (state: EditorWorkspaceState) => {
    if (state.tool === 'sculpt') return 'Sculpt';
    if (state.tool === 'paint') return 'Paint';
    return 'Place';
  };

  canvas.addEventListener('pointerdown', () => focusEditorViewport(canvas));

  const syncLayout = (state: EditorWorkspaceState) => {
    const libraryAvailable = isLibraryAvailable(state);
    slots.library.classList.toggle('is-hidden', !libraryAvailable);
    slots.library.toggleAttribute('inert', !libraryAvailable);
    slots.libraryTitle.textContent = libraryTitleFor(state);
    slots.propertiesTitle.textContent = propertiesTitleFor(state);
  };

  return {
    slots,
    syncLayout,
    dispose: () => {
      host.replaceChildren();
    },
  };
}
