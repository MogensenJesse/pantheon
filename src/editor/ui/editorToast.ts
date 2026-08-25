// src/editor/ui/editorToast.ts — non-blocking editor notifications

type EditorToastVariant = 'success' | 'error' | 'info';

const DEFAULT_MS = 4200;
const ERROR_MS = 6500;

export interface EditorToastService {
  show: (message: string, variant?: EditorToastVariant, durationMs?: number) => void;
  setParent: (parent: HTMLElement | null) => void;
  dispose: () => void;
}

export function createEditorToastService(): EditorToastService {
  let host: HTMLElement | null = null;
  let hostParent: HTMLElement | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;

  const ensureHost = (variant: EditorToastVariant): HTMLElement => {
    if (!host) {
      host = document.createElement('div');
      host.id = 'editor-toast-host';
      host.setAttribute('aria-atomic', 'true');
      (hostParent ?? document.body).appendChild(host);
    }
    host.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');
    return host;
  };

  return {
    setParent(parent) {
      hostParent = parent;
      if (host && parent && host.parentElement !== parent) {
        parent.appendChild(host);
      }
    },
    show(message, variant = 'info', durationMs) {
      const root = ensureHost(variant);
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (fadeTimer) {
        clearTimeout(fadeTimer);
        fadeTimer = null;
      }

      root.replaceChildren();
      const toast = document.createElement('div');
      toast.className = `editor-toast editor-toast--${variant}`;
      toast.textContent = message;
      if (variant === 'error') toast.setAttribute('role', 'alert');
      root.appendChild(toast);

      requestAnimationFrame(() => toast.classList.add('editor-toast--visible'));

      const ms = durationMs ?? (variant === 'error' ? ERROR_MS : DEFAULT_MS);
      hideTimer = setTimeout(() => {
        toast.classList.remove('editor-toast--visible');
        hideTimer = null;
        fadeTimer = setTimeout(() => {
          toast.remove();
          fadeTimer = null;
        }, 280);
      }, ms);
    },
    dispose() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (fadeTimer) {
        clearTimeout(fadeTimer);
        fadeTimer = null;
      }
      host?.remove();
      host = null;
      hostParent = null;
    },
  };
}

let activeToast: EditorToastService = createEditorToastService();

export function bindActiveEditorToast(service: EditorToastService): () => void {
  activeToast = service;
  return () => {
    activeToast = createEditorToastService();
  };
}

export function setEditorToastParent(parent: HTMLElement | null): void {
  activeToast.setParent(parent);
}

export function showEditorToast(
  message: string,
  variant: EditorToastVariant = 'info',
  durationMs?: number,
): void {
  activeToast.show(message, variant, durationMs);
}

export function disposeEditorToast(): void {
  activeToast.dispose();
}
