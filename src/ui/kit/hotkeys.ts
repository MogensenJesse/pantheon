// src/ui/kit/hotkeys.ts — every UI key binding in one place
//
// One listener, one table. Keeping the bindings together is what stops two screens claiming the same
// key; a second binding of a key warns in DEV and replaces the first. Typing in a field never triggers
// a hotkey, and neither do key repeats or Ctrl, Alt and Meta combinations.

import { isPanelOpen } from './panels';

export interface HotkeyOptions {
  /** Whether the key still works while a panel is open. Default true; false for keys that open a screen. */
  whenPanelOpen?: boolean;
}

interface Binding {
  handler: () => void;
  label: string;
  whenPanelOpen: boolean;
}

const bindings = new Map<string, Binding>();
let listening = false;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || isEditable(e.target)) return;
  const binding = bindings.get(e.code);
  if (!binding) return;
  if (!binding.whenPanelOpen && isPanelOpen()) return;
  e.preventDefault();
  binding.handler();
}

/** Binds a `KeyboardEvent.code` (such as `KeyO`). Returns the function that removes the binding. */
export function registerHotkey(
  code: string,
  handler: () => void,
  label = '',
  options: HotkeyOptions = {},
): () => void {
  if (bindings.has(code) && import.meta.env.DEV) {
    console.warn(
      `[ui] hotkey ${code} is already bound to "${bindings.get(code)!.label}"; replaced`,
    );
  }
  const binding: Binding = {
    handler,
    label,
    whenPanelOpen: options.whenPanelOpen ?? true,
  };
  bindings.set(code, binding);
  if (!listening) {
    document.addEventListener('keydown', onKeyDown);
    listening = true;
  }
  return () => {
    if (bindings.get(code) === binding) bindings.delete(code);
    if (bindings.size === 0 && listening) {
      document.removeEventListener('keydown', onKeyDown);
      listening = false;
    }
  };
}

/** The current bindings. */
export function listHotkeys(): { code: string; label: string }[] {
  return [...bindings].map(([code, { label }]) => ({ code, label }));
}
