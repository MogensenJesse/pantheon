// src/editor/core/editorFormGuards.ts — shortcut eligibility for editor chrome vs viewport

const EDITOR_VIEWPORT_CANVAS = '#editor';

/** True when the event target is an editable form control. */
export function isFormFieldTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!el.closest('[contenteditable="true"]');
}

/** Block document shortcuts (save, undo, delete) while typing in controls. */
export function shouldBlockEditorShortcut(target: EventTarget | null): boolean {
  return isFormFieldTarget(target);
}

/**
 * Viewport-owned shortcuts (Space pan, Alt soften) run when the canvas or viewport
 * owns focus — not while typing in chrome search fields or other controls.
 */
export function shouldHandleViewportShortcut(target: EventTarget | null): boolean {
  if (isFormFieldTarget(target)) return false;

  const active = document.activeElement as HTMLElement | null;
  if (active?.matches(EDITOR_VIEWPORT_CANVAS)) return true;
  if (active?.closest('.editor-viewport')) return true;

  if (!active || active === document.body) return true;

  if (active.closest('.editor-app') && !active.closest('.editor-viewport')) return false;

  return true;
}

export function focusEditorViewport(canvas: HTMLCanvasElement): void {
  if (document.activeElement === canvas) return;
  canvas.focus({ preventScroll: true });
}
