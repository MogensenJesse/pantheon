// src/ui/overlay/worldMarkers.ts — small DOM markers that follow points in the world
//
// The world is drawn on a canvas, so a marker is a pooled element whose screen place is worked out from
// the camera each frame. It only shows what is in front of the camera, never takes a click, and sits
// in the HUD layer, under every panel. Used for the belief pips and the target rings; the builder
// overlay is the same idea.

import type { Camera } from 'three';
import { getLayer, h } from '../kit';
import { projectToScreen, type ScreenPoint } from './project';

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

interface MarkerPool {
  /** Draws the first `count` of these markers (all by default) and hides the pooled ones left over. */
  show: (markers: readonly MarkerSpec[], count?: number) => void;
  hideAll: () => void;
  dispose: () => void;
}

const screen: ScreenPoint = { x: 0, y: 0, depth: 0 };
const MIN_PX = 6;
const LABEL_MIN_PX = 10;
const LABEL_MAX_PX = 16;

function createMarkerPool(camera: Camera & { fov?: number }, className: string): MarkerPool {
  const root = h('div', { class: `po-layer ${className}-layer`, attrs: { 'aria-hidden': 'true' } });
  getLayer('hud').appendChild(root);
  const els: HTMLElement[] = [];
  const base = `po-marker ${className}`;
  /** What each element shows now, so a frame that changes nothing writes nothing. */
  const shown: {
    /** Position and size in tenths of a pixel; level in hundredths. A frame that changes none writes nothing. */
    tx: number;
    ty: number;
    size: number;
    level: number;
    cls: string;
    label: string;
  }[] = [];

  const get = (i: number): HTMLElement => {
    let el = els[i];
    if (!el) {
      el = h('span', { class: base });
      root.appendChild(el);
      els[i] = el;
      shown[i] = {
        tx: Number.NaN,
        ty: Number.NaN,
        size: Number.NaN,
        level: Number.NaN,
        cls: base,
        label: '',
      };
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
        if (!projectToScreen(camera, m.x, m.y, m.z, screen)) continue;
        const { x: px, y: py, depth } = screen;
        if (px < -50 || px > width + 50 || py < -50 || py > height + 50) continue;
        const i = used++;
        const el = get(i);
        const last = shown[i]!;
        const px0 = ((m.sizeM ?? 0.3) * pxPerMetre) / depth;
        const isLabel = m.label !== undefined;
        const tx = Math.round(px * 10);
        const ty = Math.round(py * 10);
        const size = Math.round(
          (isLabel ? Math.min(LABEL_MAX_PX, Math.max(LABEL_MIN_PX, px0)) : Math.max(MIN_PX, px0)) *
            10,
        );
        const level = Math.round((m.level ?? 1) * 100);
        const cls = m.state ? `${base} ${m.state}` : base;
        if (tx !== last.tx || ty !== last.ty) {
          last.tx = tx;
          last.ty = ty;
          el.style.transform = `translate(${(tx / 10).toFixed(1)}px, ${(ty / 10).toFixed(1)}px) translate(-50%, -50%)`;
        }
        if (size !== last.size) {
          last.size = size;
          const css = `${(size / 10).toFixed(1)}px`;
          if (isLabel) {
            el.style.width = 'auto';
            el.style.height = css;
            el.style.fontSize = css;
          } else {
            el.style.width = css;
            el.style.height = css;
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
          el.style.setProperty('--po-level', String(level / 100));
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

/**
 * A pool of markers with the specs that feed it, reused from frame to frame: `begin()`, `add()` each marker
 * (the spec it returns can take a level, a state or a label), then `flush()` draws them.
 */
export interface MarkerLayer {
  begin: () => void;
  /** A marker at a world point, `sizeM` big. The spec is reused next frame: set its extras now. */
  add: (x: number, y: number, z: number, sizeM: number) => MarkerSpec;
  /** Markers added since `begin()`. */
  size: () => number;
  /** Draws what was added and hides the rest. */
  flush: () => void;
  hideAll: () => void;
  dispose: () => void;
}

export function createMarkerLayer(
  camera: Camera & { fov?: number },
  className: string,
): MarkerLayer {
  const pool = createMarkerPool(camera, className);
  const specs: MarkerSpec[] = [];
  let count = 0;
  return {
    begin: () => {
      count = 0;
    },
    add: (x, y, z, sizeM) => {
      let spec = specs[count];
      if (!spec) {
        spec = { x: 0, y: 0, z: 0 };
        specs[count] = spec;
      }
      count++;
      spec.x = x;
      spec.y = y;
      spec.z = z;
      spec.sizeM = sizeM;
      spec.level = undefined;
      spec.state = undefined;
      spec.label = undefined;
      return spec;
    },
    size: () => count,
    flush: () => pool.show(specs, count),
    hideAll: pool.hideAll,
    dispose: pool.dispose,
  };
}
