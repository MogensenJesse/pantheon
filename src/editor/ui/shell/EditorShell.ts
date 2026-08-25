// src/editor/ui/shell/EditorShell.ts — dual-dock editor chrome slots

import type { EditorWorkspaceState } from '../../core/EditorWorkspaceStore';
import { isLibraryAvailable } from '../../core/EditorWorkspaceStore';

export interface EditorShellSlots {
  root: HTMLElement;
  documentBar: HTMLElement;
  toolRail: HTMLElement;
  library: HTMLElement;
  libraryTitle: HTMLElement;
  libraryToggle: HTMLButtonElement;
  libraryBody: HTMLElement;
  properties: HTMLElement;
  propertiesTitle: HTMLElement;
  propertiesToggle: HTMLButtonElement;
  propertiesBody: HTMLElement;
  viewport: HTMLElement;
  overlays: HTMLElement;
  statusBar: HTMLElement;
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
      <nav class="editor-tool-rail" data-slot="tool-rail"></nav>
      <aside class="editor-dock editor-library-dock" data-slot="library">
        <div class="editor-dock-header">
          <h2 data-slot="library-title">Library</h2>
          <button type="button" class="editor-dock-toggle" data-action="toggle-library" aria-label="Collapse library">‹</button>
        </div>
        <div class="editor-dock-body" data-slot="library-body"></div>
      </aside>
      <main class="editor-viewport" data-slot="viewport">
        <canvas id="editor"></canvas>
        <div class="editor-overlays" data-slot="overlays"></div>
      </main>
      <aside class="editor-dock editor-properties-dock" data-slot="properties">
        <div class="editor-dock-header">
          <h2 data-slot="properties-title">Properties</h2>
          <button type="button" class="editor-dock-toggle" data-action="toggle-properties" aria-label="Collapse properties">›</button>
        </div>
        <div class="editor-dock-body" data-slot="properties-body"></div>
      </aside>
    </div>
    <footer class="editor-status-bar" data-slot="status-bar"></footer>
  `;

  const canvas = host.querySelector<HTMLCanvasElement>('#editor');
  if (!canvas) throw new Error('Editor shell is missing #editor canvas');

  const slots: EditorShellSlots = {
    root: host,
    documentBar: host.querySelector('[data-slot="document-bar"]')!,
    toolRail: host.querySelector('[data-slot="tool-rail"]')!,
    library: host.querySelector('[data-slot="library"]')!,
    libraryTitle: host.querySelector('[data-slot="library-title"]')!,
    libraryToggle: host.querySelector('[data-action="toggle-library"]')!,
    libraryBody: host.querySelector('[data-slot="library-body"]')!,
    properties: host.querySelector('[data-slot="properties"]')!,
    propertiesTitle: host.querySelector('[data-slot="properties-title"]')!,
    propertiesToggle: host.querySelector('[data-action="toggle-properties"]')!,
    propertiesBody: host.querySelector('[data-slot="properties-body"]')!,
    viewport: host.querySelector('[data-slot="viewport"]')!,
    overlays: host.querySelector('[data-slot="overlays"]')!,
    statusBar: host.querySelector('[data-slot="status-bar"]')!,
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

  const syncLayout = (state: EditorWorkspaceState) => {
    const libraryAvailable = isLibraryAvailable(state);
    const libraryCollapsed = libraryAvailable && state.libraryCollapsed;
    slots.library.classList.toggle('is-hidden', !libraryAvailable);
    slots.library.classList.toggle('is-collapsed', libraryCollapsed);
    slots.properties.classList.toggle('is-collapsed', state.propertiesCollapsed);
    slots.libraryTitle.textContent = libraryTitleFor(state);
    slots.propertiesTitle.textContent = propertiesTitleFor(state);
    slots.libraryToggle.hidden = !libraryAvailable;
    slots.libraryToggle.textContent = libraryCollapsed ? '›' : '‹';
    slots.libraryToggle.setAttribute(
      'aria-label',
      libraryCollapsed ? 'Expand library' : 'Collapse library',
    );
    slots.libraryToggle.setAttribute('aria-expanded', libraryCollapsed ? 'false' : 'true');
    slots.propertiesToggle.textContent = state.propertiesCollapsed ? '‹' : '›';
    slots.propertiesToggle.setAttribute(
      'aria-label',
      state.propertiesCollapsed ? 'Expand properties' : 'Collapse properties',
    );
    slots.propertiesToggle.setAttribute(
      'aria-expanded',
      state.propertiesCollapsed ? 'false' : 'true',
    );
  };

  return {
    slots,
    syncLayout,
    dispose: () => {
      host.replaceChildren();
    },
  };
}
