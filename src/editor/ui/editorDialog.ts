// src/editor/ui/editorDialog.ts — centralized confirm/prompt policy for editor actions

export interface EditorDialogService {
  confirm: (message: string) => boolean;
  confirmDestructive: (message: string) => boolean;
  prompt: (message: string, defaultValue?: string) => string | null;
}

const DEFAULT_DIALOG: EditorDialogService = {
  confirm: (message) => window.confirm(message),
  confirmDestructive: (message) => window.confirm(message),
  prompt: (message, defaultValue = '') => window.prompt(message, defaultValue),
};

let activeDialog: EditorDialogService = DEFAULT_DIALOG;

export function createEditorDialogService(
  overrides: Partial<EditorDialogService> = {},
): EditorDialogService {
  return { ...DEFAULT_DIALOG, ...overrides };
}

/** Bind session-owned dialog handlers for the editor lifetime. */
export function bindActiveEditorDialog(service: EditorDialogService): () => void {
  activeDialog = service;
  return () => {
    activeDialog = DEFAULT_DIALOG;
  };
}

export function editorConfirm(message: string): boolean {
  return activeDialog.confirm(message);
}

export function editorConfirmDestructive(message: string): boolean {
  return activeDialog.confirmDestructive(message);
}

export function editorPrompt(message: string, defaultValue = ''): string | null {
  return activeDialog.prompt(message, defaultValue);
}
