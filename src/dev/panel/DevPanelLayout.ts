// src/dev/panel/DevPanelLayout.ts — DEV-only shell: <details> containers per section
//
// IA: top-level groups are Gameplay / Look / World / Debug (see audit H8).
// Each section module replaces its `#dev-section-*` mount point with its own
// `<details class="dev-section">`. Sections that live under Look/World are
// nested inside the relevant group's body so `<details>` chevrons stack.

/**
 * Thin shell — each section module owns its own `<details>` block and mounts
 * it into the matching `#dev-section-*` container below. Section ordering is
 * fixed here so the panel layout stays predictable.
 */
const SHELL_HTML = `
  <div class="dev-title">Development</div>
  <div id="dev-section-gameplay"></div>
  <details class="dev-section dev-group" id="dev-group-look" open>
    <summary>Look</summary>
    <div class="dev-section-body">
      <div id="dev-section-glow-bloom"></div>
      <div id="dev-section-guide-line"></div>
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
  <div id="dev-section-performance"></div>
`;

export function mountDevPanelShell(): { toggle: HTMLButtonElement; panel: HTMLDivElement } {
  // Dynamic CSS import inside the function — keeps `./dev-panel.css` out of
  // the prod bundle. `initDevPanel` early-returns before calling this in prod,
  // so the import is never reached. Vite emits a separate CSS chunk that loads
  // on demand only in DEV builds where the shell is mounted.
  void import('./dev-panel.css');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'dev-toggle';
  toggle.textContent = 'Dev';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'dev-panel');

  const panel = document.createElement('div');
  panel.id = 'dev-panel';
  panel.className = 'ui-panel';
  panel.hidden = true;
  panel.innerHTML = SHELL_HTML;

  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  return { toggle, panel };
}
