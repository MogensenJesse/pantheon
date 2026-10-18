// src/ui/overlay/worldMarkers.ts — small DOM markers that follow points in the world
//
// The world is drawn on a canvas, so a marker is a pooled element whose screen place is worked out from
// the camera each frame. It only shows what is in front of the camera, never takes a click, and sits
// in the HUD layer, under every panel. Used for the belief pips and the target rings (M2b); the builder
// overlay (M3) is the same idea.

import { type Camera, Vector3 } from 'three';
import { getLayer, h } from '../kit';

export interface MarkerSpec {
  /** World point the marker is drawn at. */
  x: number;
  y: number;
  z: number;
  /** Size in metres in the world: the marker is that big on screen (with a floor in pixels). */
  sizeM?: number;
  /** 0..1, for a CSS variable `--po-level` (brightness). */
  level?: number;
  /** Extra class for this frame (a state such as `is-active`). */
  state?: string;
}

export interface MarkerPool {
  /** Draws these markers (and hides the pooled ones that are left over). */
  show: (markers: readonly MarkerSpec[]) => void;
  hideAll: () => void;
  dispose: () => void;
}

const scratch = new Vector3();
const MIN_PX = 6;

export function createMarkerPool(camera: Camera & { fov?: number }, className: string): MarkerPool {
  const root = h('div', { class: `po-layer ${className}-layer`, attrs: { 'aria-hidden': 'true' } });
  getLayer('hud').appendChild(root);
  const els: HTMLElement[] = [];
  const base = `po-marker ${className}`;

  const get = (i: number): HTMLElement => {
    let el = els[i];
    if (!el) {
      el = h('span', { class: base });
      root.appendChild(el);
      els[i] = el;
    }
    return el;
  };

  return {
    show: (markers) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const fov = ((camera.fov ?? 52) * Math.PI) / 180;
      const pxPerMetre = height / 2 / Math.tan(fov / 2);
      let used = 0;
      for (const m of markers) {
        scratch.set(m.x, m.y, m.z).applyMatrix4(camera.matrixWorldInverse);
        const depth = -scratch.z;
        if (depth <= 0.1) continue;
        scratch.set(m.x, m.y, m.z).project(camera);
        const px = (scratch.x * 0.5 + 0.5) * width;
        const py = (-scratch.y * 0.5 + 0.5) * height;
        if (px < -50 || px > width + 50 || py < -50 || py > height + 50) continue;
        const el = get(used++);
        const size = Math.max(MIN_PX, ((m.sizeM ?? 0.3) * pxPerMetre) / depth);
        el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`;
        el.style.width = el.style.height = `${size.toFixed(1)}px`;
        el.style.setProperty('--po-level', String(m.level ?? 1));
        el.className = m.state ? `${base} ${m.state}` : base;
        el.hidden = false;
      }
      for (let i = used; i < els.length; i++) els[i]!.hidden = true;
    },
    hideAll: () => {
      for (const el of els) el.hidden = true;
    },
    dispose: () => root.remove(),
  };
}
