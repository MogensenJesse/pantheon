// src/ui/abilities/radialMenu.ts — the radial cast menu: hold a key, point with the mouse, let go to cast
//
// The mouse stays locked. While the menu is open its movement moves a virtual pointer around the centre
// instead of turning the camera, and the sector under the pointer is the choice (geometry in
// abilities/radial.ts). Letting go of the key casts the chosen power; Esc, losing the mouse lock or the
// window losing focus cancels. With no power to choose, the key does nothing.

import type { AbilityView } from '../../abilities/abilityView';
import { sectorAt, sectorDirection, stepPointer } from '../../abilities/radial';
import { getLayer, h, isPanelOpen, registerHotkey } from '../kit';

export interface RadialDeps {
  /** The powers to choose from. */
  list: () => AbilityView[];
  /** Casts the chosen power. */
  cast: (id: string) => void;
  /** Stops the mouse turning the camera while the menu is open. */
  setLookBlocked: (blocked: boolean) => void;
  /** The key to hold (a `KeyboardEvent.code`). */
  code: string;
}

/** Radius of the ring in px; the pointer is kept inside it. */
const RADIUS_PX = 110;

export function createRadialMenu(deps: RadialDeps): { dispose: () => void; isOpen: () => boolean } {
  const root = h('div', {
    class: 'rm-root',
    // Pointer-only by design (hold the key, move the mouse): hidden from assistive technology rather than
    // announced as a menu that cannot be walked with the keyboard.
    attrs: { hidden: true, 'aria-hidden': 'true' },
  });
  const dot = h('span', { class: 'rm-dot' });
  const centre = h('span', { class: 'rm-centre' });
  root.append(centre, dot);
  getLayer('hud').appendChild(root);

  let open = false;
  let views: AbilityView[] = [];
  let pointer = { x: 0, y: 0 };
  let chosen: number | null = null;
  const items: HTMLElement[] = [];

  const draw = () => {
    dot.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;
    chosen = sectorAt(pointer, views.length, RADIUS_PX);
    for (const [i, el] of items.entries()) el.classList.toggle('is-chosen', i === chosen);
    const v = chosen === null ? null : views[chosen];
    centre.textContent = v ? (v.ready ? v.name : `${v.name} · ${v.note || 'not ready'}`) : '';
  };

  const close = (castIt: boolean) => {
    if (!open) return;
    open = false;
    root.hidden = true;
    deps.setLookBlocked(false);
    document.removeEventListener('pointermove', onMove);
    const v = castIt && chosen !== null ? views[chosen] : null;
    for (const el of items) el.remove();
    items.length = 0;
    if (v) deps.cast(v.id);
  };

  const onMove = (e: PointerEvent) => {
    pointer = stepPointer(pointer, e.movementX, e.movementY, RADIUS_PX);
    draw();
  };

  const openMenu = () => {
    if (open || isPanelOpen() || document.pointerLockElement === null) return;
    views = deps.list();
    if (views.length === 0) return;
    open = true;
    pointer = { x: 0, y: 0 };
    views.forEach((v, i) => {
      const dir = sectorDirection(i, views.length);
      const el = h('span', {
        class: 'rm-item',
        text: v.name,
        attrs: { 'data-ability': v.id, 'data-ready': String(v.ready) },
        style: { left: `${dir.x * RADIUS_PX}px`, top: `${dir.y * RADIUS_PX}px` },
      });
      items.push(el);
      root.appendChild(el);
    });
    root.hidden = false;
    deps.setLookBlocked(true);
    document.addEventListener('pointermove', onMove);
    draw();
  };

  const offKey = registerHotkey(deps.code, openMenu, 'Cast a power (hold)', {
    onUp: () => close(true),
  });
  // Esc ends the menu without casting (the browser also releases the mouse, which cancels too).
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close(false);
  };
  const cancel = () => close(false);
  const onLockChange = () => {
    if (!document.pointerLockElement) cancel();
  };

  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('blur', cancel);

  return {
    isOpen: () => open,
    dispose: () => {
      close(false);
      offKey();
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('blur', cancel);
      root.remove();
    },
  };
}
