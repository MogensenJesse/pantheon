// src/ui/PlayLoadingScreen.ts — play-mode bootstrap overlay (message + progress bar)

export interface PlayLoadingScreen {
  setMessage: (message: string) => void;
  setProgress: (fraction: number) => void;
  showError: (message: string) => void;
  show: () => void;
  hide: () => void;
}

export function initPlayLoadingScreen(): PlayLoadingScreen {
  const root = document.getElementById('loading');
  const messageEl = document.getElementById('loading-message');
  const barEl = document.querySelector<HTMLElement>('.loading-bar');
  const fillEl = document.getElementById('loading-bar-fill');
  const panelEl = root?.querySelector<HTMLElement>('.loading-panel');

  const setMessage = (message: string) => {
    if (messageEl) messageEl.textContent = message;
  };

  const setProgress = (fraction: number) => {
    const clamped = Math.max(0, Math.min(1, fraction));
    if (fillEl) fillEl.style.width = `${clamped * 100}%`;
    if (barEl) barEl.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
  };

  return {
    setMessage,
    setProgress,
    showError(message) {
      panelEl?.classList.add('loading-panel--error');
      setMessage(message);
    },
    show() {
      root?.classList.remove('hidden');
    },
    hide() {
      root?.classList.add('hidden');
    },
  };
}
