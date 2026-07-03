// src/editor/ui/EditorToast.ts — non-blocking editor notifications

type EditorToastVariant = 'success' | 'error' | 'info';

const DEFAULT_MS = 4200;
const ERROR_MS = 6500;

let host: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

function ensureHost(): HTMLElement {
  if (!host) {
    host = document.createElement('div');
    host.id = 'editor-toast-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
  }
  return host;
}

export function showEditorToast(
  message: string,
  variant: EditorToastVariant = 'info',
  durationMs?: number,
): void {
  const root = ensureHost();
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
}

export function disposeEditorToast(): void {
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
}
