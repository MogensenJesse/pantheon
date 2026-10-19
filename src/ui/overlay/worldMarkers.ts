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
  /**
   * Text instead of a plain shape. The marker is then `sizeM` tall in the world, kept between
   * `LABEL_MIN_PX` and `LABEL_MAX_PX` on screen, as wide as its text; the font follows its height.
   */
  label?: string;
}

export interface MarkerPool {
  /** Draws the first `count` of these markers (all by default) and hides the pooled ones left over. */
  show: (markers: readonly MarkerSpec[], count?: number) => void;
  hideAll: () => void;
  dispose: () => void;
}

const scratch = new Vector3();
const MIN_PX = 6;
const LABEL_MIN_PX = 10;
const LABEL_MAX_PX = 16;

export function createMarkerPool(camera: Camera & { fov?: number }, className: string): MarkerPool {
  const root = h('div', { class: `po-layer ${className}-layer`, attrs: { 'aria-hidden': 'true' } });
  getLayer('hud').appendChild(root);
  const els: HTMLElement[] = [];
  const base = `po-marker ${className}`;
  /** What each element shows now, so a frame that changes nothing writes nothing. */
  const shown: { transform: string; size: string; level: string; cls: string; label: string }[] =
    [];

  const get = (i: number): HTMLElement => {
    let el = els[i];
    if (!el) {
      el = h('span', { class: base });
      root.appendChild(el);
      els[i] = el;
      shown[i] = { transform: '', size: '', level: '', cls: base, label: '' };
    }
    return el;
  };

  return {
    show: (markers, count = markers.length) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const fov = ((camera.fov ?? 52) * Math.PI) / 180;
      const pxPerMetre = height / 2 / Math.tan(fov / 2);
      let used = 0;
      for (let k = 0; k < count; k++) {
        const m = markers[k]!;
        // Into view space for the depth, then on into the screen (`project` would redo the first step).
        scratch.set(m.x, m.y, m.z).applyMatrix4(camera.matrixWorldInverse);
        const depth = -scratch.z;
        if (depth <= 0.1) continue;
        scratch.applyMatrix4(camera.projectionMatrix);
        const px = (scratch.x * 0.5 + 0.5) * width;
        const py = (-scratch.y * 0.5 + 0.5) * height;
        if (px < -50 || px > width + 50 || py < -50 || py > height + 50) continue;
        const i = used++;
        const el = get(i);
        const last = shown[i]!;
        const px0 = ((m.sizeM ?? 0.3) * pxPerMetre) / depth;
        const isLabel = m.label !== undefined;
        const size = `${(isLabel ? Math.min(LABEL_MAX_PX, Math.max(LABEL_MIN_PX, px0)) : Math.max(MIN_PX, px0)).toFixed(1)}px`;
        const transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`;
        const level = String(m.level ?? 1);
        const cls = m.state ? `${base} ${m.state}` : base;
        if (transform !== last.transform) {
          last.transform = transform;
          el.style.transform = transform;
        }
        if (size !== last.size) {
          last.size = size;
          if (isLabel) {
            el.style.width = 'auto';
            el.style.height = size;
            el.style.fontSize = size;
          } else {
            el.style.width = size;
            el.style.height = size;
            el.style.fontSize = '';
          }
        }
        const label = m.label ?? '';
        if (label !== last.label) {
          last.label = label;
          el.textContent = label;
        }
        if (level !== last.level) {
          last.level = level;
          el.style.setProperty('--po-level', level);
        }
        if (cls !== last.cls) {
          last.cls = cls;
          el.className = cls;
        }
        if (el.hidden) el.hidden = false;
      }
      for (let i = used; i < els.length; i++) if (!els[i]!.hidden) els[i]!.hidden = true;
    },
    hideAll: () => {
      for (const el of els) if (!el.hidden) el.hidden = true;
    },
    dispose: () => root.remove(),
  };
}

/** Marker specs reused from frame to frame: the list grows to what is shown and objects are rewritten. */
export function createSpecList() {
  const specs: MarkerSpec[] = [];
  let count = 0;
  return {
    begin: () => {
      count = 0;
    },
    add: (
      x: number,
      y: number,
      z: number,
      sizeM: number,
      level?: number,
      state?: string,
      label?: string,
    ) => {
      let spec = specs[count];
      if (!spec) {
        spec = { x: 0, y: 0, z: 0 };
        specs[count] = spec;
      }
      spec.x = x;
      spec.y = y;
      spec.z = z;
      spec.sizeM = sizeM;
      spec.level = level;
      spec.state = state;
      spec.label = label;
      count++;
    },
    /** The pool of specs; only the first `size()` are this frame's. */
    list: () => specs,
    size: () => count,
  };
}
