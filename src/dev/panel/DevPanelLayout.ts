// src/dev/panel/DevPanelLayout.ts — DEV-only chrome: Dev + Perf toggles and panels
//
// IA: Dev panel groups are Gameplay / Look / World (see audit H8).
// Performance lives in a sibling panel toggled by the Perf button.
// Each Dev section module replaces its `#dev-section-*` mount point with its own
// `<details class="dev-section">`. Sections that live under Look/World are
// nested inside the relevant group's body so `<details>` chevrons stack.

/**
 * Thin shell — each section module owns its own `<details>` block and mounts
 * it into the matching `#dev-section-*` container below. Section ordering is
 * fixed here so the panel layout stays predictable.
 */
const DEV_SHELL_HTML = `
  <div class="dev-title">Development</div>
  <div id="dev-section-gameplay"></div>
  <details class="dev-section dev-group" id="dev-group-look" open>
    <summary>Look</summary>
    <div class="dev-section-body">
      <div id="dev-section-glow-bloom"></div>
      <div id="dev-section-guide-line"></div>
      <div id="dev-section-orb"></div>
      <div id="dev-section-godrays"></div>
      <div id="dev-section-haze"></div>
      <div id="dev-section-dof"></div>
      <div id="dev-section-postfx"></div>
      <div id="dev-section-sky"></div>
      <div id="dev-section-clouds"></div>
    </div>
  </details>
  <details class="dev-section dev-group" id="dev-group-world" open>
    <summary>World</summary>
    <div class="dev-section-body">
      <div id="dev-section-map-editor"></div>
      <div id="dev-section-terrain"></div>
      <div id="dev-section-grass"></div>
      <div id="dev-section-prop-lod"></div>
      <div id="dev-section-shadows"></div>
      <div id="dev-section-water"></div>
    </div>
  </details>
  <div id="dev-section-upscaling"></div>
`;

const PERF_SHELL_HTML = `
  <div class="dev-title">Performance</div>
  <div id="perf-section-root"></div>
`;

export interface DevChrome {
  toggleBar: HTMLDivElement;
  devToggle: HTMLButtonElement;
  perfToggle: HTMLButtonElement;
  panel: HTMLDivElement;
  perfPanel: HTMLDivElement;
}

function createToggle(id: string, label: string, controlsId: string): HTMLButtonElement {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = id;
  toggle.textContent = label;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', controlsId);
  return toggle;
}

function createPanel(id: string, html: string): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = id;
  panel.className = 'ui-panel dev-chrome-panel';
  panel.hidden = true;
  panel.innerHTML = html;
  return panel;
}

export function mountDevPanelShell(): DevChrome {
  // Dynamic CSS import inside the function — keeps `./dev-panel.css` out of
  // the prod bundle. `initDevPanel` early-returns before calling this in prod,
  // so the import is never reached. Vite emits a separate CSS chunk that loads
  // on demand only in DEV builds where the shell is mounted.
  void import('./dev-panel.css');

  const toggleBar = document.createElement('div');
  toggleBar.id = 'dev-chrome-toggles';
  const devToggle = createToggle('dev-toggle', 'Dev', 'dev-panel');
  const perfToggle = createToggle('perf-toggle', 'Perf', 'perf-panel');
  toggleBar.append(devToggle, perfToggle);

  const panel = createPanel('dev-panel', DEV_SHELL_HTML);
  const perfPanel = createPanel('perf-panel', PERF_SHELL_HTML);

  document.body.append(toggleBar, panel, perfPanel);

  return { toggleBar, devToggle, perfToggle, panel, perfPanel };
}

export function bindChromeToggles(chrome: DevChrome): () => void {
  const { devToggle, perfToggle, panel, perfPanel } = chrome;

  const bind = (toggle: HTMLButtonElement, target: HTMLDivElement) => {
    const onClick = () => {
      const open = target.hidden;
      target.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', onClick);
    return () => toggle.removeEventListener('click', onClick);
  };

  const unbindDev = bind(devToggle, panel);
  const unbindPerf = bind(perfToggle, perfPanel);
  return () => {
    unbindDev();
    unbindPerf();
  };
}
