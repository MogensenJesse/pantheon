// src/editor/core/editorFormGuards.ts — skip editor hotkeys while typing in form fields

export function isFormFieldTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
