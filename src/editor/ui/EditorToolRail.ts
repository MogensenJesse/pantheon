// src/editor/ui/EditorToolRail.ts — icon tool rail (Sculpt / Paint / Place)

import type { EditorToolId, EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import {
  createPaintToolIcon,
  createPlaceToolIcon,
  createSculptToolIcon,
} from './editorToolIcons';

export interface EditorToolRailHandlers {
  onToolChange: (tool: EditorToolId) => void;
}

export interface EditorToolRailContext {
  dispose: () => void;
}

const TOOLS: { id: EditorToolId; label: string; icon: () => SVGSVGElement }[] = [
  { id: 'sculpt', label: 'Sculpt terrain', icon: createSculptToolIcon },
  { id: 'paint', label: 'Paint biomes', icon: createPaintToolIcon },
  { id: 'place', label: 'Place props', icon: createPlaceToolIcon },
];

function wireRovingGroup(buttons: HTMLButtonElement[]): void {
  if (buttons.length === 0) return;

  const focusAt = (index: number) => {
    const btn = buttons[index];
    if (!btn) return;
    for (const item of buttons) item.tabIndex = item === btn ? 0 : -1;
    btn.focus();
  };

  focusAt(0);

  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i]!;
    btn.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      focusAt((i + delta + buttons.length) % buttons.length);
    });
  }
}

export function createEditorToolRail(
  host: HTMLElement,
  store: EditorWorkspaceStore,
  handlers: EditorToolRailHandlers,
): EditorToolRailContext {
  host.replaceChildren();

  const main = document.createElement('div');
  main.className = 'editor-tool-rail-main';
  main.setAttribute('role', 'radiogroup');
  main.setAttribute('aria-label', 'Editor tools');

  const spacer = document.createElement('div');
  spacer.className = 'editor-tool-rail-spacer';
  spacer.setAttribute('aria-hidden', 'true');

  const toolBtns: HTMLButtonElement[] = [];

  for (const tool of TOOLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-tool-icon-btn editor-tool-btn';
    btn.dataset.tool = tool.id;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    btn.setAttribute('aria-label', tool.label);
    btn.title = tool.label;
    btn.appendChild(tool.icon());
    btn.addEventListener('click', () => handlers.onToolChange(tool.id));
    main.appendChild(btn);
    toolBtns.push(btn);
  }

  host.append(main, spacer);
  wireRovingGroup(toolBtns);

  const unsub = store.subscribe((state) => {
    for (const btn of toolBtns) {
      const active = btn.dataset.tool === state.tool;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    }
  });

  return { dispose: () => unsub() };
}
