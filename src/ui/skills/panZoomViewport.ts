// src/ui/skills/panZoomViewport.ts — a box you can drag to pan and wheel to zoom, with a transformed layer
// inside it (the maths — clamping, fitting, zooming at a point — is the pure skills/skillView.ts)

import { type Bounds, clampPan, fitView, type View, zoomAt } from '../../skills/skillView';
import { h } from '../kit';

const WHEEL_ZOOM = 1.0015;
/** A press that moves less than this (px) is a click, not a drag. */
const DRAG_SLOP_PX = 4;

export interface PanZoomViewport {
  /** The box. */
  element: HTMLElement;
  /** The layer that moves and scales; put the content in it. */
  world: HTMLElement;
  /** Fits the content in the box. Call once the box is in the page (it has no size before). */
  reset: () => void;
  /** Zooms about the centre of the box. */
  zoomBy: (factor: number) => void;
}

export function createPanZoomViewport(bounds: Bounds, label: string): PanZoomViewport {
  let view: View = { x: 0, y: 0, scale: 1 };
  const world = h('div', { class: 'sk-world' });
  const viewport = h(
    'div',
    { class: 'sk-viewport', attrs: { role: 'group', 'aria-label': label } },
    world,
  );

  const size = () => ({
    width: viewport.clientWidth || 640,
    height: viewport.clientHeight || 360,
  });
  const setView = (next: View) => {
    view = clampPan(next, bounds, size());
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  };

  let drag: {
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null = null;
  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y, moved: false };
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add('is-dragging');
    }
    setView({ ...view, x: drag.originX + dx, y: drag.originY + dy });
  });
  const endDrag = (e: PointerEvent) => {
    if (drag?.moved && viewport.hasPointerCapture(e.pointerId)) {
      viewport.releasePointerCapture(e.pointerId);
    }
    // A drag that ends on a node must not also take it.
    const wasDrag = drag?.moved;
    drag = null;
    viewport.classList.remove('is-dragging');
    if (wasDrag) {
      viewport.addEventListener('click', (ev) => ev.stopPropagation(), {
        capture: true,
        once: true,
      });
    }
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      setView(
        zoomAt(view, WHEEL_ZOOM ** -e.deltaY, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        }),
      );
    },
    { passive: false },
  );

  return {
    element: viewport,
    world,
    reset: () => setView(fitView(bounds, size())),
    zoomBy: (factor) => {
      const { width, height } = size();
      setView(zoomAt(view, factor, { x: width / 2, y: height / 2 }));
    },
  };
}
