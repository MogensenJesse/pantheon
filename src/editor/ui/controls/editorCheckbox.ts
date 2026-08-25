// src/editor/ui/controls/editorCheckbox.ts — checkbox binding for editor chrome

export function bindEditorCheckbox(
  root: ParentNode,
  id: string,
  get: () => boolean,
  set: (value: boolean) => void,
): () => void {
  const el = root.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) return () => {};
  el.checked = get();
  const onChange = () => set(el.checked);
  el.addEventListener('change', onChange);
  return () => el.removeEventListener('change', onChange);
}
