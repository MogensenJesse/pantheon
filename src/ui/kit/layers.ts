// src/ui/kit/layers.ts — the UI root and its stacking layers
//
// Every piece of game UI mounts into one of these, so the order is decided in one place (z-indexes are
// tokens in tokens.css): the HUD sits under overlays, those under panels, modal panels, toasts and,
// last, tooltips. Layers let clicks through (pointer-events: none); what is mounted in them opts back in.

export type LayerName = 'hud' | 'overlay' | 'panel' | 'modal' | 'toast' | 'tooltip';

const LAYER_ORDER: readonly LayerName[] = ['hud', 'overlay', 'panel', 'modal', 'toast', 'tooltip'];

let root: HTMLDivElement | null = null;
const layers = new Map<LayerName, HTMLDivElement>();
const slots = new Map<string, HTMLElement>();

export function ensureUiRoot(): HTMLDivElement {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'ui-root';
  root.className = 'k-root';
  for (const name of LAYER_ORDER) {
    const layer = document.createElement('div');
    layer.className = `k-layer k-layer--${name}`;
    root.appendChild(layer);
    layers.set(name, layer);
  }
  document.body.appendChild(root);
  return root;
}

export function getLayer(name: LayerName): HTMLDivElement {
  ensureUiRoot();
  return layers.get(name)!;
}

/**
 * A named place in the HUD layer where pieces stack instead of each picking its own offset: the quiet
 * hint lines at the bottom centre ("Press E to save", "2 sparks to spend") sit one above the other.
 * The first child is nearest the bottom.
 */
export function getHudSlot(name: 'hints'): HTMLElement {
  const existing = slots.get(name);
  if (existing?.isConnected) return existing;
  const slot = document.createElement('div');
  slot.className = `k-hud-slot k-hud-slot--${name}`;
  getLayer('hud').appendChild(slot);
  slots.set(name, slot);
  return slot;
}

export function disposeUiRoot(): void {
  root?.remove();
  root = null;
  layers.clear();
  slots.clear();
}
